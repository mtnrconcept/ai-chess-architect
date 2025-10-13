import { resolveFx } from "./registry";
import type { FxContext, FxIntent, FxPayload } from "./types";

export async function runFxIntents(intents: FxIntent[] | undefined, ctx: FxContext, payload: FxPayload = {}) {
  if (!ctx || !Array.isArray(intents) || !intents.length) return;
  for (const intent of intents) {
    try {
      await resolveFx(intent, ctx, payload);
    } catch (error) {
      console.error("[fx] unable to resolve intent", intent, error);
    }
  }
}
