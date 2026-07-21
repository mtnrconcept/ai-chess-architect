import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.110.7";

const COMMONS_API_URL = "https://commons.wikimedia.org/w/api.php";
const COMMONS_HOST = "commons.wikimedia.org";
const COMMONS_ASSET_HOST = "upload.wikimedia.org";
const OPENAI_MODERATION_URL = "https://api.openai.com/v1/moderations";
const OPENAI_MODERATION_MODEL = "omni-moderation-latest";
const RULE_ASSET_BUCKET = "rule-assets";
const RULE_ASSET_PREFIX = "managed";
const MAX_ASSET_BYTES = 5 * 1024 * 1024;
const MIN_ASSET_DIMENSION = 64;
const MAX_ASSET_DIMENSION = 4_096;
const COMMONS_TIMEOUT_MS = 5_000;
const DOWNLOAD_TIMEOUT_MS = 6_000;
const MODERATION_TIMEOUT_MS = 6_000;
const MAX_SEARCH_RESULTS = 6;
const MAX_DOWNLOAD_CANDIDATES = 3;

const VISUAL_CUE =
  /\b(?:animation|anime|animé|animée|sprite|image|illustration|visuel|créature|dragon|fantôme|phénix|phoenix|météore|meteor|portail|portal|éclair|lightning|explosion|fumée|smoke|robot|vaisseau|spaceship|monstre|monster|aigle|eagle|corbeau|raven|requin|shark)\b/i;
const ANIMATION_CUE =
  /\b(?:arrive|apparaît|apparait|surgit|vole|survole|plonge|descend|fond|emporte|enlève|enleve|attrape|capture|disparaît|disparait|carry|carries|grab|grabs|swoop|swoops|fly|flies|burst|explode|explodes)\b/i;
const GENERIC_ACTOR_CUE =
  /\b(?:un|une|a|an|the)\s+[\p{L}][\p{L}'’-]{2,30}(?:\s+[\p{L}'’-]{2,30}){0,3}\s+(?:qui\s+)?(?:arrive|apparaît|apparait|surgit|vole|survole|plonge|descend|fond|emporte|enlève|enleve|attrape|disparaît|disparait|carry|carries|grab|grabs|swoop|swoops|fly|flies|burst|explode|explodes)\b/iu;
const CARRY_CUE =
  /\b(?:emporte|emporter|enlève|enlever|enleve|attrape|attraper|embarque|kidnappe|carry|carries|carried|grab|grabs|take(?:s)? away|steal|steals)\b/i;
const BURST_CUE =
  /\b(?:explosion|explose|éclate|eclate|burst|pop|jaillit|surgit instantanément|apparait instantanément|apparaît instantanément)\b/i;

const STOP_WORDS = new Set([
  "a",
  "au",
  "aux",
  "avec",
  "ce",
  "cette",
  "ces",
  "dun",
  "dune",
  "de",
  "des",
  "du",
  "elle",
  "elles",
  "en",
  "est",
  "et",
  "il",
  "ils",
  "la",
  "le",
  "les",
  "lui",
  "par",
  "puis",
  "qui",
  "son",
  "sa",
  "ses",
  "sur",
  "sous",
  "the",
  "un",
  "une",
  "dans",
  "pour",
  "quand",
  "lorsque",
  "piece",
  "pièce",
  "capture",
  "capturée",
  "capturee",
  "capturé",
  "emporte",
  "emporter",
  "enleve",
  "enlever",
  "attrape",
  "attraper",
  "animation",
  "anime",
  "arrive",
  "apparait",
  "apparaît",
  "vient",
  "hors",
  "plateau",
  "chess",
  "echec",
  "échec",
  "rule",
  "règle",
  "regle",
  "system",
  "système",
  "instruction",
  "instructions",
  "ignore",
  "previous",
  "developer",
  "assistant",
  "outil",
  "tool",
  "exact",
  "spriteid",
]);

export type ManagedCinematicMotion = "carry" | "swoop" | "burst";

export interface ManagedRuleAsset {
  resourceId: string;
  assetId: string;
  storagePath: string;
  motion: ManagedCinematicMotion;
  label: string;
  sourcePageUrl: string;
  sourceAssetUrl: string;
  licenseShortName: string;
  attribution: string;
  contentType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  sha256: string;
  moderationModel: string;
}

interface CommonsMetadataValue {
  value?: string;
}

interface CommonsImageInfo {
  url?: string;
  thumburl?: string;
  descriptionurl?: string;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: {
    LicenseShortName?: CommonsMetadataValue;
    Artist?: CommonsMetadataValue;
    Credit?: CommonsMetadataValue;
    ObjectName?: CommonsMetadataValue;
  };
}

interface CommonsPage {
  pageid?: number;
  title?: string;
  imageinfo?: CommonsImageInfo[];
}

interface CommonsResponse {
  query?: {
    pages?: CommonsPage[];
  };
}

interface CommonsCandidate {
  providerFileId: string;
  title: string;
  sourcePageUrl: string;
  sourceAssetUrl: string;
  licenseShortName: string;
  attribution: string;
}

interface StoredAssetRow {
  asset_id: string;
  storage_path: string;
  label: string;
  source_page_url: string;
  source_asset_url: string;
  license_short_name: string;
  attribution: string;
  content_type: string;
  width: number;
  height: number;
  content_sha256: string;
  moderation_model: string;
  moderation_flagged: boolean;
}

export interface AssetModerationDecision {
  approved: boolean;
  id: string;
  model: string;
  flagged: boolean;
  flaggedCategories: string[];
}

interface ModerationPayload {
  id?: string;
  model?: string;
  results?: Array<{
    flagged?: boolean;
    categories?: Record<string, boolean>;
  }>;
}

export interface RasterImageInspection {
  contentType: "image/png" | "image/jpeg" | "image/webp";
  extension: "png" | "jpg" | "webp";
  width: number;
  height: number;
  animated: boolean;
}

const utf8 = new TextDecoder();
const plainText = (value: string, maxLength = 240): string =>
  value
    .normalize("NFKC")
    .replace(/<[^>]*>/g, " ")
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);

const decodeBasicEntities = (value: string): string =>
  value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");

const getMetadataValue = (
  value: CommonsMetadataValue | undefined,
  maxLength: number,
): string => plainText(decodeBasicEntities(value?.value ?? ""), maxLength);

export function detectManagedCinematicMotion(
  prompt: string,
): ManagedCinematicMotion {
  if (CARRY_CUE.test(prompt)) return "carry";
  if (BURST_CUE.test(prompt)) return "burst";
  return "swoop";
}

export function extractAssetSearchQuery(prompt: string): string | null {
  if (
    (!VISUAL_CUE.test(prompt) && !GENERIC_ACTOR_CUE.test(prompt)) ||
    !ANIMATION_CUE.test(prompt)
  ) {
    return null;
  }

  const tokens =
    prompt
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/[a-z0-9-]{3,30}/g)
      ?.filter((token) => !STOP_WORDS.has(token)) ?? [];

  const uniqueTokens = [...new Set(tokens)].slice(0, 4);
  if (uniqueTokens.length === 0) return null;

  return plainText(`${uniqueTokens.join(" ")} illustration transparent`, 96);
}

export function isAllowedCommonsAssetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === COMMONS_ASSET_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith("/wikipedia/commons/") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
}

const isAllowedCommonsPageUrl = (rawUrl: string): boolean => {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === "https:" &&
      url.hostname === COMMONS_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === "" &&
      url.pathname.startsWith("/wiki/File:") &&
      url.search === "" &&
      url.hash === ""
    );
  } catch {
    return false;
  }
};

export function isAllowedAssetLicense(licenseShortName: string): boolean {
  const normalized = plainText(licenseShortName, 64).toLowerCase();
  return (
    normalized === "public domain" ||
    normalized === "cc0" ||
    normalized === "cc0 1.0"
  );
}

const buildCommonsSearchUrl = (query: string): string => {
  const url = new URL(COMMONS_API_URL);
  url.searchParams.set("action", "query");
  url.searchParams.set("format", "json");
  url.searchParams.set("origin", "*");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrlimit", String(MAX_SEARCH_RESULTS));
  url.searchParams.set("gsrsearch", query);
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|mime|size|extmetadata|canonicaltitle");
  url.searchParams.set("iiurlwidth", "1024");
  return url.toString();
};

const withTimeout = async (
  url: string,
  init: RequestInit,
  timeoutMs: number,
  fetchImpl: typeof fetch,
): Promise<Response> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
};

const parseCommonsCandidate = (page: CommonsPage): CommonsCandidate | null => {
  const info = page.imageinfo?.[0];
  const sourceAssetUrl = info?.thumburl ?? "";
  const sourcePageUrl = info?.descriptionurl ?? "";
  const licenseShortName = getMetadataValue(
    info?.extmetadata?.LicenseShortName,
    64,
  );

  if (
    !Number.isInteger(page.pageid) ||
    !isAllowedCommonsAssetUrl(sourceAssetUrl) ||
    !isAllowedCommonsPageUrl(sourcePageUrl) ||
    !isAllowedAssetLicense(licenseShortName)
  ) {
    return null;
  }

  const title =
    getMetadataValue(info?.extmetadata?.ObjectName, 120) ||
    plainText(page.title ?? "Asset Wikimedia Commons", 120);
  const artist = getMetadataValue(info?.extmetadata?.Artist, 180);
  const credit = getMetadataValue(info?.extmetadata?.Credit, 180);

  return {
    providerFileId: String(page.pageid),
    title,
    sourcePageUrl,
    sourceAssetUrl,
    licenseShortName,
    attribution: plainText(artist || credit || "Wikimedia Commons", 240),
  };
};

const searchCommons = async (
  query: string,
  fetchImpl: typeof fetch,
): Promise<CommonsCandidate[]> => {
  const response = await withTimeout(
    buildCommonsSearchUrl(query),
    {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "AIChessArchitect/2.0 managed-rule-assets",
      },
    },
    COMMONS_TIMEOUT_MS,
    fetchImpl,
  );

  if (!response.ok) return [];

  const payload = (await response.json()) as CommonsResponse;
  return (payload.query?.pages ?? [])
    .map(parseCommonsCandidate)
    .filter((candidate): candidate is CommonsCandidate => candidate !== null)
    .slice(0, MAX_DOWNLOAD_CANDIDATES);
};

const readUint24LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16);

const readUint16BE = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] << 8) | bytes[offset + 1];

const readUint16LE = (bytes: Uint8Array, offset: number): number =>
  bytes[offset] | (bytes[offset + 1] << 8);

const readUint32BE = (bytes: Uint8Array, offset: number): number =>
  ((bytes[offset] << 24) |
    (bytes[offset + 1] << 16) |
    (bytes[offset + 2] << 8) |
    bytes[offset + 3]) >>>
  0;

const asciiAt = (bytes: Uint8Array, offset: number, length: number): string =>
  utf8.decode(bytes.subarray(offset, offset + length));

const hasAsciiChunk = (bytes: Uint8Array, value: string): boolean => {
  const needle = new TextEncoder().encode(value);
  outer: for (let index = 0; index <= bytes.length - needle.length; index += 1) {
    for (let offset = 0; offset < needle.length; offset += 1) {
      if (bytes[index + offset] !== needle[offset]) continue outer;
    }
    return true;
  }
  return false;
};

const inspectPng = (bytes: Uint8Array): RasterImageInspection | null => {
  if (
    bytes.length < 24 ||
    bytes[0] !== 0x89 ||
    bytes[1] !== 0x50 ||
    bytes[2] !== 0x4e ||
    bytes[3] !== 0x47 ||
    bytes[4] !== 0x0d ||
    bytes[5] !== 0x0a ||
    bytes[6] !== 0x1a ||
    bytes[7] !== 0x0a ||
    asciiAt(bytes, 12, 4) !== "IHDR"
  ) {
    return null;
  }

  return {
    contentType: "image/png",
    extension: "png",
    width: readUint32BE(bytes, 16),
    height: readUint32BE(bytes, 20),
    animated: hasAsciiChunk(bytes, "acTL"),
  };
};

const JPEG_SOF_MARKERS = new Set([
  0xc0,
  0xc1,
  0xc2,
  0xc3,
  0xc5,
  0xc6,
  0xc7,
  0xc9,
  0xca,
  0xcb,
  0xcd,
  0xce,
  0xcf,
]);

const inspectJpeg = (bytes: Uint8Array): RasterImageInspection | null => {
  if (
    bytes.length < 11 ||
    bytes[0] !== 0xff ||
    bytes[1] !== 0xd8 ||
    bytes[bytes.length - 2] !== 0xff ||
    bytes[bytes.length - 1] !== 0xd9
  ) {
    return null;
  }

  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1;
      continue;
    }

    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8 || marker === 0xd9 || marker === 0x01) continue;
    if (offset + 2 > bytes.length) return null;

    const segmentLength = readUint16BE(bytes, offset);
    if (segmentLength < 2 || offset + segmentLength > bytes.length) return null;

    if (JPEG_SOF_MARKERS.has(marker)) {
      if (segmentLength < 7) return null;
      return {
        contentType: "image/jpeg",
        extension: "jpg",
        width: readUint16BE(bytes, offset + 5),
        height: readUint16BE(bytes, offset + 3),
        animated: false,
      };
    }

    offset += segmentLength;
  }

  return null;
};

const inspectWebp = (bytes: Uint8Array): RasterImageInspection | null => {
  if (
    bytes.length < 30 ||
    asciiAt(bytes, 0, 4) !== "RIFF" ||
    asciiAt(bytes, 8, 4) !== "WEBP"
  ) {
    return null;
  }

  const chunk = asciiAt(bytes, 12, 4);
  let width = 0;
  let height = 0;
  let animated = hasAsciiChunk(bytes, "ANIM") || hasAsciiChunk(bytes, "ANMF");

  if (chunk === "VP8X") {
    const flags = bytes[20];
    animated ||= (flags & 0x02) !== 0;
    width = readUint24LE(bytes, 24) + 1;
    height = readUint24LE(bytes, 27) + 1;
  } else if (chunk === "VP8L") {
    if (bytes[20] !== 0x2f) return null;
    width = 1 + (bytes[21] | ((bytes[22] & 0x3f) << 8));
    height =
      1 +
      ((bytes[22] >> 6) | (bytes[23] << 2) | ((bytes[24] & 0x0f) << 10));
  } else if (chunk === "VP8 ") {
    if (bytes[23] !== 0x9d || bytes[24] !== 0x01 || bytes[25] !== 0x2a) {
      return null;
    }
    width = readUint16LE(bytes, 26) & 0x3fff;
    height = readUint16LE(bytes, 28) & 0x3fff;
  } else {
    return null;
  }

  return {
    contentType: "image/webp",
    extension: "webp",
    width,
    height,
    animated,
  };
};

export function inspectRasterImage(
  bytes: Uint8Array,
): RasterImageInspection | null {
  return inspectPng(bytes) ?? inspectJpeg(bytes) ?? inspectWebp(bytes);
}

export function buildAssetModerationRequest(
  query: string,
  imageUrl: string,
): Record<string, unknown> {
  if (!isAllowedCommonsAssetUrl(imageUrl)) {
    throw new Error("ASSET_MODERATION_URL_REJECTED");
  }

  return {
    model: OPENAI_MODERATION_MODEL,
    input: [
      {
        type: "text",
        text: `Asset visuel candidat pour une règle de jeu d'échecs: ${plainText(query, 120)}`,
      },
      {
        type: "image_url",
        image_url: {
          url: imageUrl,
        },
      },
    ],
  };
}

export function parseAssetModerationResponse(
  payload: unknown,
): AssetModerationDecision | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as ModerationPayload;
  const result = data.results?.[0];
  if (
    typeof data.id !== "string" ||
    typeof data.model !== "string" ||
    typeof result?.flagged !== "boolean" ||
    !result.categories ||
    typeof result.categories !== "object"
  ) {
    return null;
  }

  const flaggedCategories = Object.entries(result.categories)
    .filter(([, flagged]) => flagged === true)
    .map(([category]) => plainText(category, 64))
    .filter(Boolean)
    .slice(0, 32);

  return {
    approved: result.flagged === false,
    id: plainText(data.id, 160),
    model: plainText(data.model, 120),
    flagged: result.flagged,
    flaggedCategories,
  };
}

const moderateCandidate = async (
  query: string,
  candidate: CommonsCandidate,
  apiKey: string,
  fetchImpl: typeof fetch,
): Promise<AssetModerationDecision | null> => {
  const response = await withTimeout(
    OPENAI_MODERATION_URL,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(
        buildAssetModerationRequest(query, candidate.sourceAssetUrl),
      ),
    },
    MODERATION_TIMEOUT_MS,
    fetchImpl,
  );

  if (!response.ok) return null;
  const decision = parseAssetModerationResponse(await response.json());
  return decision?.approved ? decision : null;
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digestInput = Uint8Array.from(bytes);
  const digest = await crypto.subtle.digest("SHA-256", digestInput.buffer);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const buildResourceId = (
  motion: ManagedCinematicMotion,
  assetId: string,
): string => `cinematic.${motion}.${assetId}`;

const rowToManagedAsset = (
  row: StoredAssetRow,
  motion: ManagedCinematicMotion,
): ManagedRuleAsset | null => {
  if (
    !/^asset_[0-9a-f]{40}\.(?:png|jpg|webp)$/.test(row.asset_id) ||
    row.storage_path !== `${RULE_ASSET_PREFIX}/${row.asset_id}` ||
    !/^[0-9a-f]{64}$/.test(row.content_sha256) ||
    row.moderation_flagged !== false ||
    !row.moderation_model ||
    !isAllowedAssetLicense(row.license_short_name) ||
    !isAllowedCommonsAssetUrl(row.source_asset_url) ||
    !isAllowedCommonsPageUrl(row.source_page_url) ||
    !["image/png", "image/jpeg", "image/webp"].includes(row.content_type) ||
    !Number.isInteger(row.width) ||
    !Number.isInteger(row.height) ||
    row.width < MIN_ASSET_DIMENSION ||
    row.height < MIN_ASSET_DIMENSION ||
    row.width > MAX_ASSET_DIMENSION ||
    row.height > MAX_ASSET_DIMENSION
  ) {
    return null;
  }

  return {
    resourceId: buildResourceId(motion, row.asset_id),
    assetId: row.asset_id,
    storagePath: row.storage_path,
    motion,
    label: plainText(row.label, 120),
    sourcePageUrl: row.source_page_url,
    sourceAssetUrl: row.source_asset_url,
    licenseShortName: plainText(row.license_short_name, 64),
    attribution: plainText(row.attribution, 240),
    contentType: row.content_type as ManagedRuleAsset["contentType"],
    width: row.width,
    height: row.height,
    sha256: row.content_sha256,
    moderationModel: plainText(row.moderation_model, 120),
  };
};

const STORED_ASSET_COLUMNS = [
  "asset_id",
  "storage_path",
  "label",
  "source_page_url",
  "source_asset_url",
  "license_short_name",
  "attribution",
  "content_type",
  "width",
  "height",
  "content_sha256",
  "moderation_model",
  "moderation_flagged",
].join(",");

const readExistingAssetByProvider = async (
  client: SupabaseClient,
  providerFileId: string,
  motion: ManagedCinematicMotion,
): Promise<ManagedRuleAsset | null> => {
  const { data, error } = await client
    .from("rule_assets")
    .select(STORED_ASSET_COLUMNS)
    .eq("provider", "wikimedia_commons")
    .eq("provider_file_id", providerFileId)
    .eq("moderation_flagged", false)
    .maybeSingle();

  if (error || !data) return null;
  return rowToManagedAsset(data as unknown as StoredAssetRow, motion);
};

const readExistingAssetByDigest = async (
  client: SupabaseClient,
  digest: string,
  motion: ManagedCinematicMotion,
): Promise<ManagedRuleAsset | null> => {
  const { data, error } = await client
    .from("rule_assets")
    .select(STORED_ASSET_COLUMNS)
    .eq("content_sha256", digest)
    .eq("moderation_flagged", false)
    .maybeSingle();

  if (error || !data) return null;
  return rowToManagedAsset(data as unknown as StoredAssetRow, motion);
};

const persistAsset = async (
  client: SupabaseClient,
  candidate: CommonsCandidate,
  query: string,
  bytes: Uint8Array,
  inspection: RasterImageInspection,
  digest: string,
  motion: ManagedCinematicMotion,
  moderation: AssetModerationDecision,
): Promise<ManagedRuleAsset | null> => {
  const existing = await readExistingAssetByDigest(client, digest, motion);
  if (existing) return existing;

  const assetId = `asset_${digest.slice(0, 40)}.${inspection.extension}`;
  const storagePath = `${RULE_ASSET_PREFIX}/${assetId}`;
  const { error: uploadError } = await client.storage
    .from(RULE_ASSET_BUCKET)
    .upload(storagePath, bytes, {
      cacheControl: "31536000",
      contentType: inspection.contentType,
      upsert: false,
    });

  if (uploadError) {
    return await readExistingAssetByDigest(client, digest, motion);
  }

  const { error: metadataError } = await client.from("rule_assets").insert({
    asset_id: assetId,
    storage_path: storagePath,
    provider: "wikimedia_commons",
    provider_file_id: candidate.providerFileId,
    label: plainText(candidate.title || query, 120),
    source_page_url: candidate.sourcePageUrl,
    source_asset_url: candidate.sourceAssetUrl,
    license_short_name: candidate.licenseShortName,
    attribution: candidate.attribution,
    content_type: inspection.contentType,
    width: inspection.width,
    height: inspection.height,
    byte_size: bytes.byteLength,
    content_sha256: digest,
    moderation_id: moderation.id,
    moderation_model: moderation.model,
    moderation_flagged: moderation.flagged,
    moderation_categories: moderation.flaggedCategories,
    moderation_checked_at: new Date().toISOString(),
  });

  if (metadataError) {
    await client.storage.from(RULE_ASSET_BUCKET).remove([storagePath]);
    return (
      (await readExistingAssetByProvider(
        client,
        candidate.providerFileId,
        motion,
      )) ?? (await readExistingAssetByDigest(client, digest, motion))
    );
  }

  return {
    resourceId: buildResourceId(motion, assetId),
    assetId,
    storagePath,
    motion,
    label: plainText(candidate.title || query, 120),
    sourcePageUrl: candidate.sourcePageUrl,
    sourceAssetUrl: candidate.sourceAssetUrl,
    licenseShortName: candidate.licenseShortName,
    attribution: candidate.attribution,
    contentType: inspection.contentType,
    width: inspection.width,
    height: inspection.height,
    sha256: digest,
    moderationModel: moderation.model,
  };
};

const downloadAndPersistCandidate = async (
  client: SupabaseClient,
  candidate: CommonsCandidate,
  query: string,
  motion: ManagedCinematicMotion,
  moderation: AssetModerationDecision,
  fetchImpl: typeof fetch,
): Promise<ManagedRuleAsset | null> => {
  if (!isAllowedCommonsAssetUrl(candidate.sourceAssetUrl)) return null;

  const response = await withTimeout(
    candidate.sourceAssetUrl,
    {
      method: "GET",
      headers: {
        Accept: "image/png,image/jpeg,image/webp",
        "User-Agent": "AIChessArchitect/2.0 managed-rule-assets",
      },
    },
    DOWNLOAD_TIMEOUT_MS,
    fetchImpl,
  );

  if (
    !response.ok ||
    !isAllowedCommonsAssetUrl(response.url || candidate.sourceAssetUrl)
  ) {
    return null;
  }

  const declaredLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_ASSET_BYTES) {
    return null;
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_ASSET_BYTES) return null;

  const inspection = inspectRasterImage(bytes);
  if (
    !inspection ||
    inspection.animated ||
    !Number.isInteger(inspection.width) ||
    !Number.isInteger(inspection.height) ||
    inspection.width < MIN_ASSET_DIMENSION ||
    inspection.height < MIN_ASSET_DIMENSION ||
    inspection.width > MAX_ASSET_DIMENSION ||
    inspection.height > MAX_ASSET_DIMENSION
  ) {
    return null;
  }

  const digest = await sha256Hex(bytes);
  return await persistAsset(
    client,
    candidate,
    query,
    bytes,
    inspection,
    digest,
    motion,
    moderation,
  );
};

const getServiceClient = (): SupabaseClient | null => {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim();
  if (!url || !serviceRole) return null;

  return createClient(url, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

export const managedRuleAssetSearchEnabled = (
  rawValue: string | undefined = Deno.env.get("RULE_ASSET_SEARCH_ENABLED"),
): boolean => {
  const normalized = rawValue?.trim().toLowerCase();
  return !["false", "0", "off", "disabled"].includes(normalized ?? "");
};

export async function resolveManagedRuleAsset(
  safePrompt: string,
  fetchImpl: typeof fetch = fetch,
): Promise<ManagedRuleAsset | null> {
  if (!managedRuleAssetSearchEnabled()) {
    return null;
  }

  const query = extractAssetSearchQuery(safePrompt);
  if (!query) return null;

  const apiKey = Deno.env.get("OPENAI_API_KEY")?.trim();
  const client = getServiceClient();
  if (!apiKey || !client) return null;

  const motion = detectManagedCinematicMotion(safePrompt);
  let candidates: CommonsCandidate[] = [];
  try {
    candidates = await searchCommons(query, fetchImpl);
  } catch {
    return null;
  }

  for (const candidate of candidates) {
    try {
      const existing = await readExistingAssetByProvider(
        client,
        candidate.providerFileId,
        motion,
      );
      if (existing) return existing;

      const moderation = await moderateCandidate(
        query,
        candidate,
        apiKey,
        fetchImpl,
      );
      if (!moderation) continue;

      const asset = await downloadAndPersistCandidate(
        client,
        candidate,
        query,
        motion,
        moderation,
        fetchImpl,
      );
      if (asset) return asset;
    } catch {
      // Le provider externe est opportuniste. Une erreur ne doit jamais élargir
      // les permissions ni faire échouer la compilation déterministe.
    }
  }

  return null;
}
