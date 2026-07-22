export type GuidanceRuntimeFailureCode =
  | "OPENAI_TIMEOUT"
  | "OPENAI_CONFIGURATION_MISSING"
  | "GUIDANCE_VALIDATION_FAILED"
  | "GUIDANCE_COMPATIBILITY_FAILED"
  | "GUIDANCE_FAILED";

export const classifyGuidanceRuntimeFailure = (
  message: string,
): GuidanceRuntimeFailureCode => {
  if (/^OpenAI n'a pas répondu dans les \d+ secondes\.$/.test(message)) {
    return "OPENAI_TIMEOUT";
  }
  if (message === "OPENAI_API_KEY_MISSING") {
    return "OPENAI_CONFIGURATION_MISSING";
  }
  if (
    message.startsWith("GUIDANCE_LEGACY_") ||
    message.startsWith("GUIDANCE_COMPAT_")
  ) {
    return "GUIDANCE_COMPATIBILITY_FAILED";
  }
  if (message.startsWith("GUIDANCE_")) {
    return "GUIDANCE_VALIDATION_FAILED";
  }
  return "GUIDANCE_FAILED";
};
