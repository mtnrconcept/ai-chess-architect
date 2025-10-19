import crypto from "crypto";
import type { CanonicalIntent } from "../schemas/canonicalIntent";

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
  const hash = crypto
    .createHash("sha256")
    .update(JSON.stringify(intent))
    .digest("hex");
  const identifier = `provider.custom_${hash.slice(0, 8)}`;
  const source = FALLBACK_TEMPLATE.replace(
    "customProvider",
    `custom_${hash.slice(0, 8)}`,
  );
  return { identifier, source, hash };
};
