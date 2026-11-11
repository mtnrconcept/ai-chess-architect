import {useEffect,useMemo,useState} from "react";
import {Link} from "react-router-dom";
import {ArrowLeft, Film, Search, Sparkles} from "lucide-react";
import NeonBackground from "@/components/layout/NeonBackground";
import {Badge} from "@/components/ui/badge";
import {Button} from "@/components/ui/button";
import {Card,CardContent,CardHeader,CardTitle} from "@/components/ui/card";
import {Input} from "@/components/ui/input";
import {getAnimationAssets,loadAnimationAssets,importedAnimationCount,type AnimationAsset} from "@/fx/animationLibrary";

const PIECE_LABELS:Record<string,string> = {
  all:"Toutes les pièces",pawn:"Pion",knight:"Cavalier",rook:"Tour",
  bishop:"Fou",queen:"Dame",king:"Roi",effect:"Sans pièce",
};
const PIECES = ["all","effect","pawn","knight","rook","bishop","queen","king"];

export default function AnimationLibrary() {
  const [animations,setAnimations]=useState<AnimationAsset[]>(getAnimationAssets);
  const [query,setQuery]=useState("");
  const [piece,setPiece]=useState("all");
  const [tag,setTag]=useState("all");
  useEffect(()=>{
    let mounted=true;
    void loadAnimationAssets().then(items=>{if(mounted)setAnimations([...items]);});
    return ()=>{mounted=false;};
  },[]);
  const tags=useMemo(()=>Array.from(new Set(animations.flatMap(item=>item.tags))).sort(),[animations]);
  const filtered=useMemo(()=>{
    const needle=query.trim().toLocaleLowerCase("fr");
    return animations.filter(item=>
      (piece==="all"||(piece==="effect" ? item.category==="effect":item.piece===piece)) &&
      (tag==="all"||item.tags.includes(tag)) &&
      (!needle||[item.id,item.title,item.tags.join(" "),item.piece||""].join(" ").toLocaleLowerCase("fr").includes(needle))
    );
  },[animations,query,piece,tag]);
  return <NeonBackground>
    <main className="mx-auto max-w-7xl space-y-6 px-4 py-7 text-white sm:px-6">
      <nav className="flex items-center gap-3">
        <Button asChild variant="ghost"><Link to="/rule-library"><ArrowLeft className="mr-2 size-4"/> Règles</Link></Button>
        <Badge className="border-cyan-400/35 bg-cyan-500/15 text-cyan-100">Effets cosmétiques vérifiés</Badge>
      </nav>
      <header className="rounded-3xl border border-cyan-300/30 bg-slate-950/85 p-6 sm:p-9">
        <div className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-[.16em] text-cyan-200"><Film className="size-4"/> Bibliothèque Aichess</div>
        <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">Animations des règles personnalisées</h1>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-white/70">
          Recherche par mot-clé, pièce ou effet. Les animations sont purement visuelles :
          elles ne modifient jamais la légalité des coups, les règles ou l'issue du match.
        </p>
        <div className="mt-5 flex flex-wrap gap-3 text-sm text-white/75">
          <span className="rounded-xl bg-white/10 px-3 py-2">{animations.length} animations disponibles</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">{importedAnimationCount()} animations importées</span>
          <span className="rounded-xl bg-white/10 px-3 py-2">Recherche avec tags</span>
        </div>
        {importedAnimationCount()===0&&<p role="status" className="mt-4 text-sm text-amber-200">
          L'import des séries archivées n'est pas encore publié. Les effets de base restent accessibles.
        </p>}
      </header>
      <section aria-label="Filtres des animations" className="space-y-4">
        <label className="relative block">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-white/50"/>
          <Input aria-label="Rechercher une animation" placeholder="Explosion, sable, bouclier, pion..." value={query} onChange={event=>setQuery(event.target.value)}
            className="min-h-12 border-white/20 bg-black/30 pl-10 text-white"/>
        </label>
        <div aria-label="Filtrer par pièce" className="flex flex-wrap gap-2">
          {PIECES.map(type=><Button key={type} size="sm" variant={piece===type?"default":"outline"}
            className={piece===type?"bg-cyan-400 text-slate-950 hover:bg-cyan-300":"border-white/20 bg-black/20 text-white hover:bg-white/10"}
            onClick={()=>setPiece(type)}>{PIECE_LABELS[type]}</Button>)}
        </div>
        <label className="block max-w-sm text-sm text-white/75">Tag
          <select aria-label="Filtrer par tag" value={tag} onChange={event=>setTag(event.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-white/20 bg-slate-950 px-3 text-white">
            <option value="all">Tous les tags</option>
            {tags.map(t=><option key={t} value={t}>{t}</option>)}
          </select>
        </label>
      </section>
      <p role="status" aria-live="polite" className="text-sm text-white/65">{filtered.length} animation{filtered.length>1?"s":""} trouvée{filtered.length>1?"s":""}</p>
      <section aria-label="Animations disponibles" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map(item=>{
          const idea = item.piece
            ? `Crée une règle personnalisée pour ${PIECE_LABELS[item.piece]?.toLowerCase()||"cette pièce"}, avec l'animation visuelle ${item.title} (identifiant ${item.id}), sans modifier le résultat des coups par l'animation.`
            : `Crée une règle personnalisée dont l'effet cosmétique est ${item.title} (identifiant ${item.id}), en conservant une mécanique déterministe et vérifiable.`;
          return <Card key={item.id} className="overflow-hidden border-white/15 bg-slate-950/90 text-white">
            <div className="relative flex aspect-square items-center justify-center bg-slate-900/80">
              <img src={item.url} alt={item.title} loading="lazy" className="h-full w-full object-contain p-3"/>
              <span className="absolute left-2 top-2 rounded-md bg-black/70 px-2 py-1 text-xs">{item.piece ? PIECE_LABELS[item.piece] : "Effet"}</span>
            </div>
            <CardHeader className="space-y-2 pb-2">
              <CardTitle className="text-base">{item.title}</CardTitle>
              <span className="break-all font-mono text-xs text-white/50">{item.id}</span>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap gap-1">{item.tags.slice(0,6).map(t=><Badge key={t} variant="outline" className="border-white/20 text-xs text-white/75">{t}</Badge>)}</div>
              <p className="text-xs text-white/50">{item.frames} images · {item.durationMs} ms</p>
              <Button asChild className="min-h-11 w-full bg-cyan-400 text-slate-950 hover:bg-cyan-300">
                <Link to={`/generator?idea=${encodeURIComponent(idea)}`}><Sparkles className="mr-2 size-4"/> Utiliser dans une règle</Link>
              </Button>
            </CardContent>
          </Card>;
        })}
      </section>
      {!filtered.length&&<p className="py-14 text-center text-white/70">Aucune animation ne correspond aux filtres.</p>}
    </main>
  </NeonBackground>;
}
