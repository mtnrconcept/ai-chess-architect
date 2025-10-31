import { describe, expect, it } from "vitest";

import { transformAiRuleToEngineRule } from "./aiRuleTransformer";
import type { RuleJSON } from "@/engine/types";

describe("transformAiRuleToEngineRule", () => {
  it("returns RuleJSON unchanged when already valid", () => {
    const rule: RuleJSON = {
      meta: { ruleId: "test", ruleName: "Test" },
      logic: {
        effects: [
          {
            id: "effect-1",
            when: "onAction",
            do: { action: "piece.move" },
          },
        ],
      },
    };

    const result = transformAiRuleToEngineRule(rule);

    expect(result).toBe(rule);
  });

  it("normalizes legacy effects with mixed action formats", () => {
    const result = transformAiRuleToEngineRule({
      ruleId: "blink",
      ruleName: "Blink bishops",
      description: "Allow bishops to blink across the board.",
      tags: ["blink"],
      affectedPieces: ["bishop"],
      effects: [
        {
          id: "teleport",
          when: "onAction",
          do: [
            { action: "piece.move", params: { delta: [2, 2] } },
            "piece.capture",
          ],
        },
      ],
    });

    const effects = result.logic?.effects ?? [];
    expect(effects).toHaveLength(1);
    const effect = effects[0];

    expect(effect.id).toBe("teleport");
    expect(effect.when).toBe("onAction");
    expect(Array.isArray(effect.do)).toBe(true);
    if (Array.isArray(effect.do)) {
      expect(effect.do[0]).toEqual({
        action: "piece.move",
        params: { delta: [2, 2] },
      });
      expect(effect.do[1]).toEqual({ action: "piece.capture" });
    }
  });

  it("preserves params when action is provided via effect.action", () => {
    const result = transformAiRuleToEngineRule({
      ruleId: "spawn",
      ruleName: "Summon rook",
      effects: [
        {
          action: "piece.spawn",
          params: { type: "rook", tile: "d4" },
          trigger: "onTurnStart",
        },
      ],
    });

    const effect = result.logic?.effects?.[0];
    expect(effect?.when).toBe("onTurnStart");
    expect(effect?.do).toEqual({
      action: "piece.spawn",
      params: { type: "rook", tile: "d4" },
    });
  });

  it("applies fallback params to string actions", () => {
    const result = transformAiRuleToEngineRule({
      ruleId: "toast",
      ruleName: "Cheer",
      effects: [
        {
          when: "onAction",
          do: "ui.toast",
          params: { message: "Bravo" },
        },
      ],
    });

    const effect = result.logic?.effects?.[0];
    expect(effect?.do).toEqual({
      action: "ui.toast",
      params: { message: "Bravo" },
    });
  });

  it("keeps initial state when provided", () => {
    const result = transformAiRuleToEngineRule({
      meta: { ruleId: "legacy" },
      ruleName: "Legacy rule",
      state: { initial: { stacks: 1 } },
      effects: [],
    });

    expect(result.state?.initial).toEqual({ stacks: 1 });
  });
});
