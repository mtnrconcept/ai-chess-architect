export const RULE_SCENE_ID_PATTERN =
  /^scene\.[a-z0-9][a-z0-9.-]{2,63}$/;
export const MAX_RULE_SCENES = 4;
export const MAX_RULE_ASSET_BYTES = 4 * 1024 * 1024;

const OPENVERSE_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ALLOWED_LICENSES = new Set(["cc0", "pdm", "by"]);
const ALLOWED_FILETYPES = new Set(["png", "webp", "jpg", "jpeg"]);
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

export interface OpenverseRuleAssetCandidate {
  id: string;
  title: string;
  creator: string | null;
  creatorUrl: string | null;
  license: "cc0" | "pdm" | "by";
  licenseUrl: string | null;
  attribution: string;
  sourcePageUrl: string;
  filetype: "png" | "webp" | "jpg" | "jpeg";
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const cleaned = value
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned ? cleaned.slice(0, maxLength) : null;
};

const safeHttpsUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const actionList = (value: unknown): unknown[] =>
  Array.isArray(value) ? value.slice(0, 24) : value === undefined ? [] : [value];

/**
 * Reads only the deterministic compiled rule projection. It never traverses
 * arbitrary object graphs and accepts only scene identifiers from the closed
 * `vfx.play` channel.
 */
export function extractRuleSceneIds(compiledRule: unknown): string[] {
  if (!isRecord(compiledRule) || !isRecord(compiledRule.logic)) return [];
  const effects = Array.isArray(compiledRule.logic.effects)
    ? compiledRule.logic.effects.slice(0, 24)
    : [];
  const sceneIds: string[] = [];
  const seen = new Set<string>();

  for (const effect of effects) {
    if (!isRecord(effect)) continue;
    for (const action of actionList(effect.do)) {
      if (!isRecord(action) || action.action !== "vfx.play") continue;
      if (!isRecord(action.params)) continue;
      const sprite = action.params.sprite;
      if (
        typeof sprite !== "string" ||
        !RULE_SCENE_ID_PATTERN.test(sprite) ||
        seen.has(sprite)
      ) {
        continue;
      }
      seen.add(sprite);
      sceneIds.push(sprite);
      if (sceneIds.length >= MAX_RULE_SCENES) return sceneIds;
    }
  }

  return sceneIds;
}

export function sceneIdToSearchQuery(sceneId: string): string {
  if (!RULE_SCENE_ID_PATTERN.test(sceneId)) {
    throw new Error("RULE_SCENE_ID_INVALID");
  }
  const subject = sceneId
    .slice("scene.".length)
    .split(/[.-]+/)
    .filter(Boolean)
    .slice(0, 10)
    .join(" ");
  return `${subject} fantasy game illustration transparent`;
}

export function isAllowedRuleAssetMimeType(value: string): boolean {
  return ALLOWED_MIME_TYPES.has(value.toLowerCase().split(";", 1)[0].trim());
}

export function storageExtensionForMime(value: string): "png" | "webp" | "jpg" {
  const normalized = value.toLowerCase().split(";", 1)[0].trim();
  if (normalized === "image/png") return "png";
  if (normalized === "image/webp") return "webp";
  if (normalized === "image/jpeg") return "jpg";
  throw new Error("RULE_ASSET_MIME_UNSUPPORTED");
}

export function selectOpenverseRuleAssetCandidate(
  payload: unknown,
): OpenverseRuleAssetCandidate | null {
  if (!isRecord(payload) || !Array.isArray(payload.results)) return null;

  for (const raw of payload.results.slice(0, 20)) {
    if (!isRecord(raw)) continue;
    const id = cleanText(raw.id, 36);
    const license = cleanText(raw.license, 12)?.toLowerCase();
    const filetype = cleanText(raw.filetype, 10)?.toLowerCase();
    const filesize = typeof raw.filesize === "number" ? raw.filesize : null;
    const width = typeof raw.width === "number" ? raw.width : null;
    const height = typeof raw.height === "number" ? raw.height : null;

    if (!id || !OPENVERSE_ID_PATTERN.test(id)) continue;
    if (!license || !ALLOWED_LICENSES.has(license)) continue;
    if (!filetype || !ALLOWED_FILETYPES.has(filetype)) continue;
    if (raw.mature === true) continue;
    if (filesize !== null && (filesize <= 0 || filesize > MAX_RULE_ASSET_BYTES)) {
      continue;
    }
    if (width !== null && width < 128) continue;
    if (height !== null && height < 128) continue;

    const title = cleanText(raw.title, 160) ?? "Illustration sans titre";
    const creator = cleanText(raw.creator, 120);
    const creatorUrl = safeHttpsUrl(raw.creator_url);
    const licenseUrl = safeHttpsUrl(raw.license_url);
    const providedAttribution = cleanText(raw.attribution, 400);
    const attribution =
      providedAttribution ??
      `${title} — ${creator ?? "créateur non renseigné"} (${license.toUpperCase()})`;

    return {
      id,
      title,
      creator,
      creatorUrl,
      license: license as OpenverseRuleAssetCandidate["license"],
      licenseUrl,
      attribution,
      sourcePageUrl: `https://openverse.org/image/${id}`,
      filetype: filetype as OpenverseRuleAssetCandidate["filetype"],
    };
  }

  return null;
}

export async function sha256Bytes(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
