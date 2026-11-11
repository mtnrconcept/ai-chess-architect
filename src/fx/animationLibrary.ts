/**
 * Trusted, read-only registry for media used by the custom-rule VFX runtime.
 * The generated catalog is served from this app's own public directory. Rule
 * JSON may request an ID, but never an arbitrary URL or executable content.
 */
export type AnimationPiece = "pawn" | "knight" | "rook" | "bishop" | "queen" | "king";
export type AnimationCategory = "effect" | "piece";

export interface AnimationAsset {
  id: string;
  title: string;
  category: AnimationCategory;
  piece: AnimationPiece | null;
  tags: string[];
  url: string;
  frames: number;
  durationMs: number;
  sha256?: string;
  series?: number;
}

const EXISTING: ReadonlyArray<AnimationAsset> = [
  { id:"aichess_lightning", title:"Foudre", category:"effect", piece:null, tags:["attaque","foudre","electricite"],url:"/rule-gifs/lightning.gif",frames:48,durationMs:1920 },
  { id:"aichess_fire", title:"Feu", category:"effect", piece:null, tags:["attaque","feu","magma"],url:"/rule-gifs/fire.gif",frames:48,durationMs:1920 },
  { id:"aichess_sand", title:"Sable", category:"effect", piece:null, tags:["piege","terrain","sable"],url:"/rule-gifs/sand.gif",frames:48,durationMs:1920 },
  { id:"aichess_ice", title:"Glace", category:"effect", piece:null, tags:["gel","glace","defense"],url:"/rule-gifs/ice.gif",frames:48,durationMs:1920 },
  { id:"aichess_portal", title:"Portail", category:"effect", piece:null, tags:["deplacement","portail","magie"],url:"/rule-gifs/portal.gif",frames:48,durationMs:1920 },
  { id:"aichess_robot", title:"Robot", category:"piece", piece:"pawn", tags:["transformation","robot","pion"],url:"/rule-gifs/pawn.gif",frames:48,durationMs:1920 },
  { id:"aichess_knight", title:"Cavalier", category:"piece", piece:"knight", tags:["cavalier","mouvement"],url:"/rule-gifs/knight.gif",frames:48,durationMs:1920 },
  { id:"aichess_bishop", title:"Fou", category:"piece", piece:"bishop", tags:["fou","magie"],url:"/rule-gifs/bishop.gif",frames:48,durationMs:1920 },
  { id:"aichess_rook", title:"Tour", category:"piece", piece:"rook", tags:["tour","defense"],url:"/rule-gifs/rook.gif",frames:48,durationMs:1920 },
  { id:"aichess_queen", title:"Dame", category:"piece", piece:"queen", tags:["dame","magie"],url:"/rule-gifs/queen.gif",frames:48,durationMs:1920 },
];

const ID = /^aichess-s\d{2}-\d{2}$/;
const URL = /^\/aichess-animations\/s\d{2}\/[a-zA-Z0-9_.-]+\.gif$/;
const HASH = /^[0-9a-f]{64}$/;
const PIECES = new Set<AnimationPiece>(["pawn","knight","rook","bishop","queen","king"]);
const existingById = new Map(EXISTING.map(item=>[item.id,item]));
const importedById = new Map<string,AnimationAsset>();
let loading: Promise<readonly AnimationAsset[]> | null = null;

const cleanTag = (value: unknown): string | null =>
  typeof value === "string" && /^[a-z0-9-]{2,28}$/.test(value) ? value : null;

function validateEntry(value: unknown): AnimationAsset | null {
  if (!value || typeof value !== "object") return null;
  const x = value as Record<string,unknown>;
  if (typeof x.id !== "string" || !ID.test(x.id)) return null;
  if (typeof x.url !== "string" || !URL.test(x.url)) return null;
  // Importer marks entries as published only after their binaries are copied.
  if (x.is_published !== true || x.is_valid_animation !== true) return null;
  if (typeof x.sha256 !== "string" || !HASH.test(x.sha256)) return null;
  if (typeof x.title !== "string" || x.title.length > 110) return null;
  if (typeof x.width !== "number" || x.width < 512 ||
      typeof x.height !== "number" || x.height < 512 ||
      typeof x.frames !== "number" || x.frames < 2 || x.frames > 256) return null;
  const piece = typeof x.piece === "string" && PIECES.has(x.piece as AnimationPiece)
    ? x.piece as AnimationPiece : null;
  const tags = Array.isArray(x.tags)
    ? Array.from(new Set(x.tags.map(cleanTag).filter((tag):tag is string=>tag!==null))).slice(0,16)
    : [];
  return {
    id:x.id,
    title:x.title,
    category:piece ? "piece" : "effect",
    piece,
    tags,
    url:x.url,
    frames:x.frames,
    durationMs:typeof x.duration_ms==="number" ? Math.max(200,Math.min(8000,x.duration_ms)):1920,
    sha256:x.sha256,
    series:typeof x.series==="number" ? x.series : undefined,
  };
}

export const getAnimationAssets = (): AnimationAsset[] =>
  [...EXISTING, ...Array.from(importedById.values())];

export const importedAnimationCount = (): number => importedById.size;
export const getAnimationAssetUrl = (id: string): string | null =>
  importedById.get(id)?.url ?? existingById.get(id)?.url ?? null;

/** Fail closed: missing/invalid catalogs keep the existing ten bundled effects. */
export async function loadAnimationAssets(): Promise<readonly AnimationAsset[]> {
  if (loading) return loading;
  if (typeof fetch !== "function") return getAnimationAssets();
  loading = (async () => {
    try {
      const response = await fetch("/aichess-animations/catalog.json", {cache:"no-store"});
      if (!response.ok) return getAnimationAssets();
      const body:unknown = await response.json();
      const items = body && typeof body==="object" && "entries" in body
        ? (body as {entries?:unknown}).entries : null;
      if (!Array.isArray(items) || items.length > 1500) return getAnimationAssets();
      const fresh = new Map<string,AnimationAsset>();
      for(const raw of items){
        const asset=validateEntry(raw);
        if (asset && !existingById.has(asset.id)) fresh.set(asset.id,asset);
      }
      importedById.clear();
      for (const [id,asset] of fresh) importedById.set(id,asset);
    } catch {
      // No remote URLs, data URI or arbitrary rule-controlled resources.
    }
    return getAnimationAssets();
  })();
  try { return await loading; } finally { loading = null; }
}

function normalize(value:string):string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
}
const WORD_TAGS: Array<[RegExp,string]> = [
  [/sable|quicksand|mine|piege|trap/,"piege"],
  [/gel|glace|cryo|freeze|frost/,"glace"],
  [/lave|feu|fire|magma|incend|brul|solar|flamme/,"feu"],
  [/foudre|electr|lightning|orage|tesla/,"foudre"],
  [/bouclier|rempart|defen|protec|armure/,"defense"],
  [/portail|teleport|warp|echange|deplac/,"portail"],
  [/gravite|gravit|trou.noir/,"gravite"],
  [/chrono|temps|time|tour/,"chronologie"],
  [/clone|invisib|fantome|illusion/,"projection"],
  [/capture|attaque|explos|frapp|impact/,"attaque"],
  [/invoqu|magie|arcane|sort|rune/,"magie"],
];

function suggestionTags(description:string):string[] {
  const value=normalize(description);
  return WORD_TAGS.filter(([pattern])=>pattern.test(value)).map(([,tag])=>tag);
}

/**
 * Existing 100 catalog rules and published custom rules can pick a cosmetic
 * effect deterministically, without changing rule legality, targets or turns.
 * Returned values are trusted IDs, never arbitrary resource URLs.
 */
export function suggestAnimationId(
  description: string,
  piece: AnimationPiece | null = null,
  fallback: string | null = null,
): string | null {
  const imported=Array.from(importedById.values());
  if (imported.length===0) return fallback;
  const tags=suggestionTags(description);
  const normalized=normalize(description);
  const candidates = imported.filter(a=>piece ? a.piece===piece : a.category==="effect");
  const pool=candidates.length ? candidates : imported.filter(a=>a.category==="effect");
  if (!pool.length) return fallback;
  let seed=0;
  for(const character of normalized) seed=(Math.imul(seed,31)+character.charCodeAt(0))|0;
  const rotate=Math.abs(seed >>> 0) % pool.length;
  const ranked=pool.map((asset,index)=>({
    asset,
    score:tags.reduce((sum,tag)=>sum+(asset.tags.includes(tag)?10:0),0)
      +(normalize(asset.title).split(/\W+/).filter(token=>token.length>3 && normalized.includes(token)).length*3),
    tie:(index+pool.length-rotate)%pool.length,
  })).sort((a,b)=>b.score-a.score||a.tie-b.tie);
  return ranked[0]?.asset.id ?? fallback;
}
