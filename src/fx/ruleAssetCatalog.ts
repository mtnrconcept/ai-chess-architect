import { requireSupabaseClient } from "@/integrations/supabase/client";

const RULE_SCENE_ID_PATTERN = /^scene\.[a-z0-9][a-z0-9.-]{2,63}$/;
const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/webp",
  "image/jpeg",
]);

export interface RuleSceneAsset {
  sceneId: string;
  url: string;
  mimeType: "image/png" | "image/webp" | "image/jpeg";
  attribution: string | null;
  license: "cc0" | "pdm" | "by" | null;
  sourcePageUrl: string | null;
}

type CacheEntry = {
  expiresAt: number;
  promise: Promise<RuleSceneAsset | null>;
};

const cache = new Map<string, CacheEntry>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const safeSignedAssetUrl = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      !parsed.pathname.includes("/storage/v1/object/sign/rule-assets/")
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const safeOpenversePage = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  try {
    const parsed = new URL(value);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "openverse.org" ||
      !parsed.pathname.startsWith("/image/") ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.toString();
  } catch {
    return null;
  }
};

const readAsset = async (sceneId: string): Promise<RuleSceneAsset | null> => {
  try {
    const supabase = requireSupabaseClient();
    const { data, error } = await supabase.functions.invoke(
      "resolve-rule-assets",
      {
        body: { action: "lookup", sceneId },
      },
    );
    if (error || !isRecord(data) || data.success !== true || !isRecord(data.data)) {
      return null;
    }

    const payload = data.data;
    if (payload.available !== true || payload.sceneId !== sceneId) return null;
    const url = safeSignedAssetUrl(payload.url);
    const mimeType =
      typeof payload.mimeType === "string" ? payload.mimeType : "";
    if (!url || !ALLOWED_MIME_TYPES.has(mimeType)) return null;

    const license =
      payload.license === "cc0" ||
      payload.license === "pdm" ||
      payload.license === "by"
        ? payload.license
        : null;
    const attribution =
      typeof payload.attribution === "string"
        ? payload.attribution.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 400)
        : null;

    return {
      sceneId,
      url,
      mimeType: mimeType as RuleSceneAsset["mimeType"],
      attribution,
      license,
      sourcePageUrl: safeOpenversePage(payload.sourcePageUrl),
    };
  } catch {
    return null;
  }
};

export function getRuleSceneAsset(
  sceneId: string,
): Promise<RuleSceneAsset | null> {
  if (!RULE_SCENE_ID_PATTERN.test(sceneId)) return Promise.resolve(null);
  const now = Date.now();
  const existing = cache.get(sceneId);
  if (existing && existing.expiresAt > now) return existing.promise;

  const promise = readAsset(sceneId);
  const entry: CacheEntry = {
    // A missing result is refreshed quickly; a signed result is replaced before
    // its one-hour server expiry.
    expiresAt: now + 30_000,
    promise,
  };
  cache.set(sceneId, entry);
  void promise.then((asset) => {
    const current = cache.get(sceneId);
    if (current?.promise !== promise) return;
    current.expiresAt = Date.now() + (asset ? 50 * 60_000 : 30_000);
  });
  return promise;
}

export function clearRuleSceneAssetCache(): void {
  cache.clear();
}
