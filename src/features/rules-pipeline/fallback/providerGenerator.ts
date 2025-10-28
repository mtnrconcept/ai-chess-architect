import type { CanonicalIntent } from "../schemas/canonicalIntent";

const computeHash = (input: string): string => {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  const normalized = (hash >>> 0).toString(16).padStart(8, "0");
  return normalized.slice(0, 16);
};

export type FallbackProvider = {
  identifier: string;
  source: string;
  hash: string;
};

const FALLBACK_TEMPLATE = `import { ProviderContext } from "@/engine/types";

export const customProvider = (ctx: ProviderContext) => {
  const results = [] as any[];
  // TODO: implémentation générée par LLM
  return results;
};
`;

export const buildFallbackProvider = (
  intent: CanonicalIntent,
): FallbackProvider => {
  const hash = computeHash(JSON.stringify(intent));
  const identifier = `provider.custom_${hash.slice(0, 8)}`;
  const source = FALLBACK_TEMPLATE.replace(
    "customProvider",
    `custom_${hash.slice(0, 8)}`,
  );
  return { identifier, source, hash };
};
