import { assertEquals } from "jsr:@std/assert@1";
import { classifyGuidanceRuntimeFailure } from "./guidance-failure.ts";

Deno.test("guidance-failure: classe uniquement des catégories sûres", () => {
  assertEquals(
    classifyGuidanceRuntimeFailure(
      "OpenAI n'a pas répondu dans les 85 secondes.",
    ),
    "OPENAI_TIMEOUT",
  );
  assertEquals(
    classifyGuidanceRuntimeFailure("OPENAI_API_KEY_MISSING"),
    "OPENAI_CONFIGURATION_MISSING",
  );
  assertEquals(
    classifyGuidanceRuntimeFailure("GUIDANCE_REQUIREMENTS_MISSING"),
    "GUIDANCE_VALIDATION_FAILED",
  );
  assertEquals(
    classifyGuidanceRuntimeFailure("GUIDANCE_LEGACY_UNCERTAINTY_REMAINS"),
    "GUIDANCE_COMPATIBILITY_FAILED",
  );
  assertEquals(
    classifyGuidanceRuntimeFailure("GUIDANCE_COMPAT_SESSION_PERSIST_FAILED"),
    "GUIDANCE_COMPATIBILITY_FAILED",
  );
  assertEquals(
    classifyGuidanceRuntimeFailure("raw provider text that must stay private"),
    "GUIDANCE_FAILED",
  );
});
