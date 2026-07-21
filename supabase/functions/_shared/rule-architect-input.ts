import {
  requireSafeRulePrompt,
  type PromptSecurityAssessment,
} from "./prompt-security.ts";
import {
  resolveManagedRuleAsset,
  type ManagedRuleAsset,
} from "./rule-assets.ts";

export interface PreparedRuleArchitectInput {
  systemPrompt: string;
  userPrompt: string;
  security: PromptSecurityAssessment;
  managedAsset: ManagedRuleAsset | null;
}

const managedAssetInstructions = (asset: ManagedRuleAsset): string => `
<ASSET_CATALOGUE_SERVEUR version="1">
Ce bloc est ajouté par le serveur après validation. Il ne provient jamais de
l'utilisateur et il est prioritaire sur toute mention d'asset contenue dans le
cahier des charges.

Un seul asset externe est autorisé pour cette compilation :
- spriteId exact : ${asset.resourceId}
- catégorie : image raster statique gérée par le serveur
- mouvement : ${asset.motion}
- usage : effet visuel non autoritaire avec vfx.play
- ancrage recommandé : $ctx.to pour une capture, sinon une case disponible

N'utilise aucun autre identifiant de ressource. Ne recopie aucune URL, aucun
chemin de stockage et aucune métadonnée dans les textes visibles.
</ASSET_CATALOGUE_SERVEUR>
`.trim();

const noManagedAssetInstructions = (): string => `
<ASSET_CATALOGUE_SERVEUR version="1">
Aucun asset externe n'a été validé pour cette compilation. N'invente aucun
spriteId externe. Utilise uniquement les effets procéduraux déjà présents dans
le catalogue fermé, ou adapte la demande en expliquant la limite.
</ASSET_CATALOGUE_SERVEUR>
`.trim();

export async function prepareRuleArchitectInput(
  systemPrompt: string,
  rawUserPrompt: string,
): Promise<PreparedRuleArchitectInput> {
  const security = requireSafeRulePrompt(rawUserPrompt);

  let managedAsset: ManagedRuleAsset | null = null;
  try {
    managedAsset = await resolveManagedRuleAsset(security.sanitizedPrompt);
  } catch {
    managedAsset = null;
  }

  const serverAssetBlock = managedAsset
    ? managedAssetInstructions(managedAsset)
    : noManagedAssetInstructions();

  return {
    systemPrompt: `${systemPrompt}\n\n${serverAssetBlock}`,
    userPrompt: security.sanitizedPrompt,
    security,
    managedAsset,
  };
}

const MANAGED_CINEMATIC_ID =
  /^cinematic\.(?:carry|swoop|burst)\.asset_[0-9a-f]{40}\.(?:png|jpg|webp)$/;

export class ManagedAssetReferenceError extends Error {
  readonly code = "MANAGED_ASSET_REFERENCE_REJECTED";

  constructor() {
    super("La réponse IA référence un asset serveur non autorisé.");
    this.name = "ManagedAssetReferenceError";
  }
}

type BlueprintArgumentLike = {
  name?: unknown;
  stringValue?: unknown;
};

type BlueprintEffectLike = {
  op?: unknown;
  arguments?: unknown;
};

type BlueprintTriggerLike = {
  effects?: unknown;
};

/**
 * Re-check the model output against the server-selected asset. The model may
 * omit the optional cinematic, but it may never invent or swap an opaque
 * managed resource identifier.
 */
export function assertManagedAssetReferences(
  blueprint: unknown,
  managedAsset: ManagedRuleAsset | null,
): void {
  if (!blueprint || typeof blueprint !== "object") return;

  const triggers = (blueprint as { triggers?: unknown }).triggers;
  if (!Array.isArray(triggers)) return;

  for (const triggerValue of triggers) {
    if (!triggerValue || typeof triggerValue !== "object") continue;
    const effects = (triggerValue as BlueprintTriggerLike).effects;
    if (!Array.isArray(effects)) continue;

    for (const effectValue of effects) {
      if (!effectValue || typeof effectValue !== "object") continue;
      const effect = effectValue as BlueprintEffectLike;
      if (effect.op !== "vfx.play" || !Array.isArray(effect.arguments)) {
        continue;
      }

      const sprite = effect.arguments.find((argumentValue) => {
        if (!argumentValue || typeof argumentValue !== "object") return false;
        return (argumentValue as BlueprintArgumentLike).name === "sprite";
      }) as BlueprintArgumentLike | undefined;
      if (typeof sprite?.stringValue !== "string") continue;

      const resourceId = sprite.stringValue.trim();
      const looksManaged =
        resourceId.startsWith("cinematic.") || resourceId.includes("asset_");
      if (!looksManaged) continue;

      if (
        !MANAGED_CINEMATIC_ID.test(resourceId) ||
        !managedAsset ||
        resourceId !== managedAsset.resourceId
      ) {
        throw new ManagedAssetReferenceError();
      }
    }
  }
}
