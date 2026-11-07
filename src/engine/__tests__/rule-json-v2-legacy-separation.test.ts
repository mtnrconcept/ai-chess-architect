import { describe, expect, it } from "vitest";
import { convertRuleJsonToChessRule } from "../../lib/ruleJsonToChessRule";
import { realOpenAIQuicksandRule } from "./fixtures/openai-quicksand-20261107";
import { quicksandRule } from "../../rules/exampleRules";

describe("Rule Architect V2 and legacy ability separation", () => {
  it("does not transform V2 quicksand into a legacy exploding special attack", () => {
    const ruleJson = {
      ...realOpenAIQuicksandRule,
      meta: { ...realOpenAIQuicksandRule.meta, isActive: true },
    };
    const rule = convertRuleJsonToChessRule(ruleJson);
    expect(rule.isActive).toBe(true);
    expect(rule.effects).toEqual([]);
    expect(rule.uiActions).toHaveLength(1);
    expect(rule.uiActions?.[0]).toMatchObject({
      id: "pawn-quicksand-traps.place-quicksand",
      maxPerPiece: 3,
      consumesTurn: true,
    });
    const attached = rule as typeof rule & { __originalRuleJson?: unknown };
    expect(attached.__originalRuleJson).toEqual(ruleJson);
  });

  it("retains legacy ability conversion for non-Rule-Architect rules", () => {
    const legacy = convertRuleJsonToChessRule(quicksandRule);
    expect(legacy.effects.some((effect) => effect.action === "addAbility")).toBe(true);
    expect(legacy.uiActions?.length).toBeGreaterThan(0);
  });
});
