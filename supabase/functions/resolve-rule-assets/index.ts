import { authenticateRequest } from "../_shared/auth-v2.ts";
import { handlePreflight, jsonResponse } from "../_shared/cors-v2.ts";
import {
  extractRuleSceneIds,
  isAllowedRuleAssetMimeType,
  MAX_RULE_ASSET_BYTES,
  RULE_SCENE_ID_PATTERN,
  sceneIdToSearchQuery,
  selectOpenverseRuleAssetCandidate,
  sha256Bytes,
  storageExtensionForMime,
  type OpenverseRuleAssetCandidate,
} from "../_shared/rule-assets.ts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_BUCKET = "rule-assets";
const OPENVERSE_API = "https://api.openverse.org/v1/images/";
const OPENVERSE_HOST = "api.openverse.org";
const MAX_OPENVERSE_RESPONSE_CHARS = 512_000;
const DEFAULT_TIMEOUT_MS = 7_000;

interface RuleSceneAssetRow {
  id: string;
  scene_id: string;
  status: "ready" | "failed";
  storage_path: string | null;
  mime_type: string | null;
  byte_size: number | null;
  provider: string;
  provider_asset_id: string | null;
  title: string | null;
  creator: string | null;
  license: string | null;
  attribution: string | null;
  source_page_url: string | null;
  failure_code: string | null;
}

interface SafeSceneAsset {
  sceneId: string;
  available: boolean;
  url: string | null;
  mimeType: string | null;
  attribution: string | null;
  license: string | null;
  sourcePageUrl: string | null;
  fallback: boolean;
}

const readIntegerEnv = (
  name: string,
  fallback: number,
  minimum: number,
  maximum: number,
): number => {
  const parsed = Number(Deno.env.get(name));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(minimum, Math.min(maximum, Math.floor(parsed)));
};

const timeoutSignal = (): AbortSignal =>
  AbortSignal.timeout(
    readIntegerEnv(
      "RULE_ASSET_FETCH_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS,
      1_000,
      15_000,
    ),
  );

const openverseHeaders = (): Headers => {
  const headers = new Headers({
    Accept: "application/json",
    "User-Agent": "AI-Chess-Architect/2.0 rule-assets",
  });
  const token = Deno.env.get("OPENVERSE_API_TOKEN")?.trim();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return headers;
};

const safeContentType = (response: Response): string =>
  (response.headers.get("content-type") ?? "")
    .toLowerCase()
    .split(";", 1)[0]
    .trim();

const enforceDeclaredSize = (response: Response, maximum: number): void => {
  const value = response.headers.get("content-length");
  if (!value) return;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > maximum) {
    throw new Error("RULE_ASSET_SIZE_REJECTED");
  }
};

const fetchOpenverseJson = async (sceneId: string): Promise<unknown> => {
  const endpoint = new URL(OPENVERSE_API);
  endpoint.searchParams.set("q", sceneIdToSearchQuery(sceneId));
  endpoint.searchParams.set("license", "cc0,pdm,by");
  endpoint.searchParams.set("categories", "illustration");
  endpoint.searchParams.set("page_size", "12");
  endpoint.searchParams.set("page", "1");

  const response = await fetch(endpoint, {
    method: "GET",
    headers: openverseHeaders(),
    redirect: "error",
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error("OPENVERSE_SEARCH_FAILED");
  if (safeContentType(response) !== "application/json") {
    throw new Error("OPENVERSE_CONTENT_TYPE_REJECTED");
  }
  enforceDeclaredSize(response, MAX_OPENVERSE_RESPONSE_CHARS);
  const text = await response.text();
  if (text.length > MAX_OPENVERSE_RESPONSE_CHARS) {
    throw new Error("OPENVERSE_RESPONSE_TOO_LARGE");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("OPENVERSE_RESPONSE_INVALID");
  }
};

const downloadOpenverseThumbnail = async (
  candidate: OpenverseRuleAssetCandidate,
): Promise<{ bytes: Uint8Array; mimeType: string }> => {
  const endpoint = new URL(
    `${OPENVERSE_API}${encodeURIComponent(candidate.id)}/thumb/`,
  );
  endpoint.searchParams.set("full_size", "false");
  endpoint.searchParams.set("compressed", "true");
  if (endpoint.hostname !== OPENVERSE_HOST || endpoint.protocol !== "https:") {
    throw new Error("RULE_ASSET_SOURCE_REJECTED");
  }

  const headers = openverseHeaders();
  headers.set("Accept", "image/png,image/webp,image/jpeg");
  const response = await fetch(endpoint, {
    method: "GET",
    headers,
    redirect: "error",
    signal: timeoutSignal(),
  });
  if (!response.ok) throw new Error("OPENVERSE_DOWNLOAD_FAILED");
  const mimeType = safeContentType(response);
  if (!isAllowedRuleAssetMimeType(mimeType)) {
    throw new Error("RULE_ASSET_MIME_UNSUPPORTED");
  }
  enforceDeclaredSize(response, MAX_RULE_ASSET_BYTES);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RULE_ASSET_BYTES) {
    throw new Error("RULE_ASSET_SIZE_REJECTED");
  }
  return { bytes, mimeType };
};

const readSceneAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  sceneId: string,
): Promise<RuleSceneAssetRow | null> => {
  const { data, error } = await serviceClient
    .from("rule_scene_assets")
    .select(
      "id,scene_id,status,storage_path,mime_type,byte_size,provider,provider_asset_id,title,creator,license,attribution,source_page_url,failure_code",
    )
    .eq("scene_id", sceneId)
    .maybeSingle();
  if (error) throw new Error("RULE_ASSET_READ_FAILED");
  return data ? (data as RuleSceneAssetRow) : null;
};

const persistFailedAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  sceneId: string,
  failureCode: string,
): Promise<void> => {
  const { error } = await serviceClient.from("rule_scene_assets").upsert(
    {
      scene_id: sceneId,
      status: "failed",
      provider: "openverse",
      failure_code: failureCode.slice(0, 80),
      storage_path: null,
      mime_type: null,
      byte_size: null,
      sha256: null,
      provider_asset_id: null,
      title: null,
      creator: null,
      creator_url: null,
      license: null,
      license_url: null,
      attribution: null,
      source_page_url: null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "scene_id" },
  );
  if (error) throw new Error("RULE_ASSET_FAILURE_PERSIST_FAILED");
};

const uploadAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  bytes: Uint8Array,
  mimeType: string,
  sha256: string,
): Promise<string> => {
  const extension = storageExtensionForMime(mimeType);
  const storagePath = `scenes/${sha256}.${extension}`;
  const { error } = await serviceClient.storage
    .from(STORAGE_BUCKET)
    .upload(storagePath, bytes, {
      contentType: mimeType,
      cacheControl: "31536000",
      upsert: false,
    });

  if (
    error &&
    !/already exists|duplicate|resource exists/i.test(error.message ?? "")
  ) {
    throw new Error("RULE_ASSET_UPLOAD_FAILED");
  }
  return storagePath;
};

const persistReadyAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  sceneId: string,
  candidate: OpenverseRuleAssetCandidate,
  storagePath: string,
  mimeType: string,
  byteSize: number,
  sha256: string,
): Promise<RuleSceneAssetRow> => {
  const { data, error } = await serviceClient
    .from("rule_scene_assets")
    .upsert(
      {
        scene_id: sceneId,
        status: "ready",
        storage_path: storagePath,
        mime_type: mimeType,
        byte_size: byteSize,
        sha256,
        provider: "openverse",
        provider_asset_id: candidate.id,
        title: candidate.title,
        creator: candidate.creator,
        creator_url: candidate.creatorUrl,
        license: candidate.license,
        license_url: candidate.licenseUrl,
        attribution: candidate.attribution,
        source_page_url: candidate.sourcePageUrl,
        failure_code: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "scene_id" },
    )
    .select(
      "id,scene_id,status,storage_path,mime_type,byte_size,provider,provider_asset_id,title,creator,license,attribution,source_page_url,failure_code",
    )
    .single();
  if (error || !data) throw new Error("RULE_ASSET_PERSIST_FAILED");
  return data as RuleSceneAssetRow;
};

const resolveSceneAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  sceneId: string,
): Promise<RuleSceneAssetRow | null> => {
  const existing = await readSceneAsset(serviceClient, sceneId);
  if (existing?.status === "ready" && existing.storage_path) return existing;

  try {
    const searchPayload = await fetchOpenverseJson(sceneId);
    const candidate = selectOpenverseRuleAssetCandidate(searchPayload);
    if (!candidate) {
      await persistFailedAsset(serviceClient, sceneId, "NO_SAFE_ASSET");
      return null;
    }
    const downloaded = await downloadOpenverseThumbnail(candidate);
    const sha256 = await sha256Bytes(downloaded.bytes);
    const storagePath = await uploadAsset(
      serviceClient,
      downloaded.bytes,
      downloaded.mimeType,
      sha256,
    );
    return await persistReadyAsset(
      serviceClient,
      sceneId,
      candidate,
      storagePath,
      downloaded.mimeType,
      downloaded.bytes.byteLength,
      sha256,
    );
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
        ? error.message
        : "RULE_ASSET_RESOLUTION_FAILED";
    await persistFailedAsset(serviceClient, sceneId, code).catch(() => undefined);
    console.error("[resolve-rule-assets]", { code });
    return null;
  }
};

const linkCompilationAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  compilationId: string,
  assetId: string,
): Promise<void> => {
  const { error } = await serviceClient
    .from("rule_compilation_scene_assets")
    .upsert(
      {
        compilation_id: compilationId,
        scene_asset_id: assetId,
      },
      { onConflict: "compilation_id,scene_asset_id" },
    );
  if (error) throw new Error("RULE_ASSET_LINK_FAILED");
};

const signedSceneAsset = async (
  serviceClient: Awaited<ReturnType<typeof authenticateRequest>>["serviceClient"],
  row: RuleSceneAssetRow | null,
): Promise<SafeSceneAsset> => {
  if (!row || row.status !== "ready" || !row.storage_path) {
    return {
      sceneId: row?.scene_id ?? "",
      available: false,
      url: null,
      mimeType: null,
      attribution: null,
      license: null,
      sourcePageUrl: null,
      fallback: true,
    };
  }

  const expiresIn = readIntegerEnv(
    "RULE_ASSET_SIGNED_URL_SECONDS",
    3600,
    300,
    86400,
  );
  const { data, error } = await serviceClient.storage
    .from(STORAGE_BUCKET)
    .createSignedUrl(row.storage_path, expiresIn);
  if (error || !data?.signedUrl) throw new Error("RULE_ASSET_SIGN_FAILED");

  return {
    sceneId: row.scene_id,
    available: true,
    url: data.signedUrl,
    mimeType: row.mime_type,
    attribution: row.attribution,
    license: row.license,
    sourcePageUrl: row.source_page_url,
    fallback: false,
  };
};

Deno.serve(async (request) => {
  const preflight = handlePreflight(request);
  if (preflight) return preflight;
  if (request.method !== "POST") {
    return jsonResponse(request, 405, {
      success: false,
      code: "METHOD_NOT_ALLOWED",
      error: "Méthode non autorisée.",
    });
  }

  try {
    const { user, serviceClient } = await authenticateRequest(request);
    const body = (await request.json().catch(() => null)) as {
      action?: unknown;
      compilationId?: unknown;
      sceneId?: unknown;
    } | null;
    const action = body?.action === "lookup" ? "lookup" : "resolve";

    if (action === "lookup") {
      const sceneId = typeof body?.sceneId === "string" ? body.sceneId : "";
      if (!RULE_SCENE_ID_PATTERN.test(sceneId)) {
        return jsonResponse(request, 400, {
          success: false,
          code: "RULE_SCENE_ID_INVALID",
          error: "Identifiant de scène invalide.",
        });
      }
      const row = await readSceneAsset(serviceClient, sceneId);
      const asset = await signedSceneAsset(serviceClient, row);
      if (!asset.sceneId) asset.sceneId = sceneId;
      return jsonResponse(request, 200, {
        success: true,
        data: asset,
      });
    }

    const compilationId =
      typeof body?.compilationId === "string" ? body.compilationId : "";
    if (!UUID_PATTERN.test(compilationId)) {
      return jsonResponse(request, 400, {
        success: false,
        code: "COMPILATION_ID_INVALID",
        error: "Identifiant de compilation invalide.",
      });
    }

    const { data: compilation, error: compilationError } = await serviceClient
      .from("rule_compilations")
      .select("id,user_id,status,compiled_rule,expires_at")
      .eq("id", compilationId)
      .single();
    if (
      compilationError ||
      !compilation ||
      compilation.user_id !== user.id ||
      !["validated", "published"].includes(compilation.status) ||
      new Date(compilation.expires_at).getTime() <= Date.now()
    ) {
      return jsonResponse(request, 404, {
        success: false,
        code: "COMPILATION_NOT_AVAILABLE",
        error: "Compilation indisponible.",
      });
    }

    const sceneIds = extractRuleSceneIds(compilation.compiled_rule);
    const assets: SafeSceneAsset[] = [];
    for (const sceneId of sceneIds) {
      const row = await resolveSceneAsset(serviceClient, sceneId);
      if (row) await linkCompilationAsset(serviceClient, compilationId, row.id);
      const safeAsset = await signedSceneAsset(serviceClient, row);
      if (!safeAsset.sceneId) safeAsset.sceneId = sceneId;
      assets.push(safeAsset);
    }

    return jsonResponse(request, 200, {
      success: true,
      data: {
        compilationId,
        requested: sceneIds.length,
        resolved: assets.filter((asset) => asset.available).length,
        fallback: assets.filter((asset) => asset.fallback).length,
        assets,
      },
    });
  } catch (error) {
    const code =
      error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
        ? error.message
        : "RULE_ASSET_REQUEST_FAILED";
    const status =
      code === "AUTH_REQUIRED" || code === "AUTH_INVALID" ? 401 : 500;
    console.error("[resolve-rule-assets]", {
      code: status === 401 ? "AUTHENTICATION_FAILED" : code,
    });
    return jsonResponse(request, status, {
      success: false,
      code: status === 401 ? "AUTHENTICATION_FAILED" : code,
      error:
        status === 401
          ? "Authentification requise."
          : "La préparation des assets a échoué. Le rendu procédural reste disponible.",
      retryable: status !== 401,
    });
  }
});
