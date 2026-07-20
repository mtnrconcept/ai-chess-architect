import type { SupabaseClient } from "npm:@supabase/supabase-js@2.110.7";
import {
  normalizePresentationSearchQuery,
} from "./schema.ts";
import type {
  PresentationAssetRequestV1,
  PresentationDiagnostic,
  ResolvedPresentationAsset,
} from "./types.ts";

const OPENVERSE_ORIGIN = "https://api.openverse.org";
const OPENVERSE_SEARCH_PATH = "/v1/images/";
const STORAGE_BUCKET = "rule-assets-public";
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const MAX_JSON_BYTES = 512 * 1024;
const FETCH_TIMEOUT_MS = 7_000;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_LICENSES = new Set(["cc0", "pdm"]);

interface OpenverseImageResult {
  id?: unknown;
  title?: unknown;
  creator?: unknown;
  license?: unknown;
  mature?: unknown;
  attribution?: unknown;
  unstable__sensitivity?: unknown;
}

interface OpenverseSearchResponse {
  results?: unknown;
}

interface DownloadedImage {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  extension: "jpg" | "png" | "webp";
}

const safeMetadata = (value: unknown, maximum = 240): string =>
  typeof value === "string"
    ? value
        .normalize("NFKC")
        .replace(/[\u0000-\u001f\u007f]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, maximum)
    : "";

const withTimeout = async <T>(
  operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

const readBodyWithLimit = async (
  response: Response,
  maximumBytes: number,
): Promise<Uint8Array> => {
  const declaredLength = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new Error("REMOTE_BODY_TOO_LARGE");
  }

  if (!response.body) {
    throw new Error("REMOTE_BODY_MISSING");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maximumBytes) {
        await reader.cancel("body limit exceeded").catch(() => undefined);
        throw new Error("REMOTE_BODY_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const joined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return joined;
};

const bytesToText = (bytes: Uint8Array): string =>
  new TextDecoder("utf-8", { fatal: true }).decode(bytes);

const isPng = (bytes: Uint8Array): boolean =>
  bytes.length >= 8 &&
  bytes[0] === 0x89 &&
  bytes[1] === 0x50 &&
  bytes[2] === 0x4e &&
  bytes[3] === 0x47 &&
  bytes[4] === 0x0d &&
  bytes[5] === 0x0a &&
  bytes[6] === 0x1a &&
  bytes[7] === 0x0a;

const isJpeg = (bytes: Uint8Array): boolean =>
  bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;

const isWebp = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 &&
  bytes[0] === 0x52 &&
  bytes[1] === 0x49 &&
  bytes[2] === 0x46 &&
  bytes[3] === 0x46 &&
  bytes[8] === 0x57 &&
  bytes[9] === 0x45 &&
  bytes[10] === 0x42 &&
  bytes[11] === 0x50;

const sniffImage = (
  bytes: Uint8Array,
  contentType: string,
): DownloadedImage => {
  const normalized = contentType.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized === "image/png" && isPng(bytes)) {
    return { bytes, mimeType: "image/png", extension: "png" };
  }
  if (normalized === "image/jpeg" && isJpeg(bytes)) {
    return { bytes, mimeType: "image/jpeg", extension: "jpg" };
  }
  if (normalized === "image/webp" && isWebp(bytes)) {
    return { bytes, mimeType: "image/webp", extension: "webp" };
  }
  throw new Error("REMOTE_IMAGE_TYPE_REJECTED");
};

const sha256Hex = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
};

const searchOpenverse = async (
  request: PresentationAssetRequestV1,
): Promise<OpenverseImageResult | null> => {
  const url = new URL(OPENVERSE_SEARCH_PATH, OPENVERSE_ORIGIN);
  url.searchParams.set("q", normalizePresentationSearchQuery(request.query));
  url.searchParams.set("license", "cc0,pdm");
  url.searchParams.set("mature", "false");
  url.searchParams.set("filter_dead", "true");
  url.searchParams.set("page_size", "8");

  const response = await withTimeout((signal) =>
    fetch(url, {
      method: "GET",
      redirect: "error",
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "AIChessArchitect/1.0 (rule presentation asset resolver; https://ai-chess-architect.vercel.app)",
      },
    })
  );

  if (!response.ok) {
    throw new Error("OPENVERSE_SEARCH_FAILED");
  }

  const bytes = await readBodyWithLimit(response, MAX_JSON_BYTES);
  let payload: OpenverseSearchResponse;
  try {
    payload = JSON.parse(bytesToText(bytes)) as OpenverseSearchResponse;
  } catch {
    throw new Error("OPENVERSE_RESPONSE_INVALID");
  }

  if (!Array.isArray(payload.results)) return null;
  for (const candidate of payload.results) {
    if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }
    const result = candidate as OpenverseImageResult;
    const id = typeof result.id === "string" ? result.id : "";
    const license =
      typeof result.license === "string" ? result.license.toLowerCase() : "";
    const sensitivity = result.unstable__sensitivity;
    if (
      !UUID_PATTERN.test(id) ||
      !SAFE_LICENSES.has(license) ||
      result.mature === true ||
      (Array.isArray(sensitivity) && sensitivity.length > 0)
    ) {
      continue;
    }
    return result;
  }

  return null;
};

const downloadOpenverseThumbnail = async (
  providerAssetId: string,
): Promise<DownloadedImage> => {
  if (!UUID_PATTERN.test(providerAssetId)) {
    throw new Error("OPENVERSE_ASSET_ID_INVALID");
  }

  const url = new URL(
    `/v1/images/${encodeURIComponent(providerAssetId)}/thumb/`,
    OPENVERSE_ORIGIN,
  );
  if (url.origin !== OPENVERSE_ORIGIN) {
    throw new Error("OPENVERSE_ORIGIN_INVALID");
  }

  const response = await withTimeout((signal) =>
    fetch(url, {
      method: "GET",
      redirect: "manual",
      signal,
      headers: {
        Accept: "image/webp,image/png,image/jpeg",
        "User-Agent":
          "AIChessArchitect/1.0 (rule presentation asset resolver; https://ai-chess-architect.vercel.app)",
      },
    })
  );

  if (response.status >= 300 && response.status < 400) {
    throw new Error("OPENVERSE_REDIRECT_REJECTED");
  }
  if (!response.ok) {
    throw new Error("OPENVERSE_THUMBNAIL_FAILED");
  }

  const bytes = await readBodyWithLimit(response, MAX_IMAGE_BYTES);
  return sniffImage(bytes, response.headers.get("content-type") ?? "");
};

const fallbackAsset = (
  request: PresentationAssetRequestV1,
): ResolvedPresentationAsset => ({
  requestId: request.id,
  visualId: request.visualId,
  status: "fallback",
  provider: "builtin",
  providerAssetId: null,
  storageBucket: null,
  storagePath: null,
  publicUrl: null,
  mimeType: null,
  byteSize: null,
  sha256: null,
  license: "builtin",
  licenseUrl: null,
  attribution: "Effet procédural intégré à AI Chess Architect.",
  landingUrl: null,
  fallback: request.fallback,
});

const diagnostic = (
  request: PresentationAssetRequestV1,
  code: string,
  message: string,
): PresentationDiagnostic => ({
  code,
  severity: "warning",
  path: `assetRequests.${request.id}`,
  message,
});

export async function resolvePresentationAsset(input: {
  serviceClient: SupabaseClient;
  presentationId: string;
  request: PresentationAssetRequestV1;
}): Promise<{
  asset: ResolvedPresentationAsset;
  diagnostic: PresentationDiagnostic | null;
}> {
  try {
    const candidate = await searchOpenverse(input.request);
    if (!candidate || typeof candidate.id !== "string") {
      return {
        asset: fallbackAsset(input.request),
        diagnostic: diagnostic(
          input.request,
          "OPEN_ASSET_NOT_FOUND",
          "Aucun média public-domain suffisamment sûr n'a été trouvé ; le fallback procédural sera utilisé.",
        ),
      };
    }

    const license = String(candidate.license).toLowerCase() as "cc0" | "pdm";
    const image = await downloadOpenverseThumbnail(candidate.id);
    const hash = await sha256Hex(image.bytes);
    const storagePath = `v1/${input.presentationId}/${hash}.${image.extension}`;

    const { error: uploadError } = await input.serviceClient.storage
      .from(STORAGE_BUCKET)
      .upload(storagePath, image.bytes, {
        contentType: image.mimeType,
        cacheControl: "31536000",
        upsert: false,
      });

    if (
      uploadError &&
      !String(uploadError.message).toLowerCase().includes("duplicate")
    ) {
      throw new Error("ASSET_STORAGE_UPLOAD_FAILED");
    }

    const { data: publicData } = input.serviceClient.storage
      .from(STORAGE_BUCKET)
      .getPublicUrl(storagePath);
    const publicUrl = publicData.publicUrl;
    if (typeof publicUrl !== "string" || !publicUrl.startsWith("https://")) {
      throw new Error("ASSET_PUBLIC_URL_INVALID");
    }

    const title = safeMetadata(candidate.title, 120) || "Média sans titre";
    const creator = safeMetadata(candidate.creator, 120);
    const sourceAttribution = safeMetadata(candidate.attribution, 240);
    const attribution =
      sourceAttribution ||
      `${title}${creator ? ` — ${creator}` : ""} (${license.toUpperCase()}, via Openverse)`;
    const licenseUrl =
      license === "cc0"
        ? "https://creativecommons.org/publicdomain/zero/1.0/"
        : "https://creativecommons.org/publicdomain/mark/1.0/";

    return {
      asset: {
        requestId: input.request.id,
        visualId: input.request.visualId,
        status: "ready",
        provider: "openverse",
        providerAssetId: candidate.id,
        storageBucket: STORAGE_BUCKET,
        storagePath,
        publicUrl,
        mimeType: image.mimeType,
        byteSize: image.bytes.byteLength,
        sha256: hash,
        license,
        licenseUrl,
        attribution,
        landingUrl: `${OPENVERSE_ORIGIN}/v1/images/${candidate.id}/`,
        fallback: input.request.fallback,
      },
      diagnostic: null,
    };
  } catch {
    return {
      asset: fallbackAsset(input.request),
      diagnostic: diagnostic(
        input.request,
        "OPEN_ASSET_RESOLUTION_FAILED",
        "La recherche ou la copie sécurisée de l'asset a échoué ; le gameplay reste disponible avec un fallback procédural.",
      ),
    };
  }
}
