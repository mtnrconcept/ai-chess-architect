import { assertEquals } from "jsr:@std/assert@1";
import { resolveRuleArchitectModel } from "./rule-model-policy.ts";

Deno.test(
  "Rule Architect uses GPT-5.6 Sol in all standard paths by default",
  () => {
    const empty = (_key: string) => undefined;
    assertEquals(resolveRuleArchitectModel("standard", empty), "gpt-5.6-sol");
    assertEquals(resolveRuleArchitectModel("premium", empty), "gpt-5.6-sol");
    assertEquals(resolveRuleArchitectModel("guidance", empty), "gpt-5.6-sol");
    assertEquals(resolveRuleArchitectModel("audit", empty), "gpt-5.6-sol");
  },
);

Deno.test("server-only overrides never come from the client request", () => {
  const env = (key: string) =>
    ({
      OPENAI_RULE_MODEL: "gpt-5.6-sol",
      OPENAI_RULE_AUDIT_MODEL: "gpt-5.6-sol",
    })[key];
  assertEquals(resolveRuleArchitectModel("standard", env), "gpt-5.6-sol");
  assertEquals(resolveRuleArchitectModel("premium", env), "gpt-5.6-sol");
  assertEquals(resolveRuleArchitectModel("guidance", env), "gpt-5.6-sol");
  assertEquals(
    resolveRuleArchitectModel("audit", env, "gpt-5.6-sol"),
    "gpt-5.6-sol",
  );
});

Deno.test("explicit server overrides remain deploy-configurable", () => {
  const env = (key: string): string | undefined =>
    (
      ({
        OPENAI_RULE_MODEL: "custom-approved-model",
        OPENAI_PREMIUM_RULE_MODEL: "gpt-5.6-sol",
        OPENAI_RULE_GUIDANCE_MODEL: "gpt-5.6-sol",
      }) as Record<string, string>
    )[key];
  assertEquals(
    resolveRuleArchitectModel("standard", env),
    "custom-approved-model",
  );
  assertEquals(resolveRuleArchitectModel("premium", env), "gpt-5.6-sol");
  assertEquals(resolveRuleArchitectModel("guidance", env), "gpt-5.6-sol");
  assertEquals(
    resolveRuleArchitectModel("audit", env, "custom-approved-model"),
    "custom-approved-model",
  );
});
