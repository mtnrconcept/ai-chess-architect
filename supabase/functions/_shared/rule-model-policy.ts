/**
 * Rule Architect uses one canonical server-side OpenAI model policy.
 * The model cannot be selected via untrusted prompts, query params or client JSON.
 * Standard and premium compile with the same capable model, but different
 * server-authorized reasoning budgets.
 */
export const DEFAULT_RULE_MODEL = "gpt-5.6-sol";

export type RuleModelRole = "standard" | "premium" | "guidance" | "audit";
type EnvReader = (name: string) => string | undefined;

export function resolveRuleArchitectModel(
  role: RuleModelRole,
  readEnv: EnvReader = (name) => Deno.env.get(name),
  selectedCompilationModel?: string,
): string {
  const configured = (key: string): string | null => {
    const value = readEnv(key)?.trim();
    return value || null;
  };

  switch (role) {
    case "premium":
      return configured("OPENAI_PREMIUM_RULE_MODEL") ?? DEFAULT_RULE_MODEL;
    case "standard":
      return configured("OPENAI_RULE_MODEL") ?? DEFAULT_RULE_MODEL;
    case "guidance":
      return (
        configured("OPENAI_RULE_GUIDANCE_MODEL") ??
        configured("OPENAI_RULE_MODEL") ??
        DEFAULT_RULE_MODEL
      );
    case "audit":
      return (
        configured("OPENAI_RULE_AUDIT_MODEL") ??
        selectedCompilationModel ??
        DEFAULT_RULE_MODEL
      );
  }
}
