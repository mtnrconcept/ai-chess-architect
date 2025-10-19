import { describe, it, expect } from "vitest";
import { Registry } from "./registry";
import { convertChessRuleToRuleJSON } from "@/lib/chessRuleToRuleJsonConverter";
import type { ChessRule } from "@/types/chess";
import type { LogicStep, ActionStep } from "@/engine/types";

function getActionSteps(ruleEffect?: LogicStep): ActionStep[] {
  if (!ruleEffect) return [];
  const steps = Array.isArray(ruleEffect.do) ? ruleEffect.do : [ruleEffect.do];
  return steps as ActionStep[];
}

describe("Registry effect resolution", () => {
  it("resolves context placeholders for neighbor targeting rules", () => {
    const chessRule: ChessRule = {
      ruleId: "neighbor_cooldown_capture",
      ruleName: "Neighbor Trap",
      description: "Deploy a trap on a neighbor tile and capture its occupant.",
      category: "special",
      affectedPieces: ["knight"],
      trigger: "conditional",
      conditions: [],
      effects: [
        {
          action: "deployBomb",
          target: "self",
          parameters: { radius: 1, countdown: 2 },
        },
        {
          action: "capture",
          target: "opponent",
          parameters: {},
        },
      ],
      tags: ["test"],
      priority: 1,
      isActive: true,
      validationRules: {
        allowedWith: [],
        conflictsWith: [],
        requiredState: {},
      },
    };

    const conversion = convertChessRuleToRuleJSON(chessRule);
    expect(conversion.success).toBe(true);
    const logic = (conversion.rule?.logic?.effects ?? []) as LogicStep[];

    const uiEffect = logic.find(
      (step) => step.when === "ui.special_deployBomb_0",
    );
    const captureEffect = logic.find(
      (step) => step.when === "lifecycle.onTurnStart",
    );

    expect(uiEffect).toBeTruthy();
    expect(captureEffect).toBeTruthy();

    const registry = new Registry();
    const trapCalls: Array<Record<string, unknown>> = [];
    const cooldownCalls: Array<Record<string, unknown>> = [];
    const captureCalls: Array<Record<string, unknown>> = [];

    registry.registerEffect("tile.setTrap", (_ctx, params) => {
      trapCalls.push(params);
    });
    registry.registerEffect("cooldown.set", (_ctx, params) => {
      cooldownCalls.push(params);
    });
    registry.registerEffect("piece.capture", (_ctx, params) => {
      captureCalls.push(params);
    });

    const ctx: Record<string, unknown> = {
      pieceId: "piece-123",
      targetTile: "c3",
      targetPieceId: "enemy-7",
      state: {},
    };

    getActionSteps(uiEffect).forEach((step) => registry.runEffect(step, ctx));
    getActionSteps(captureEffect).forEach((step) =>
      registry.runEffect(step, ctx),
    );

    expect(trapCalls[0]).toMatchObject({ tile: "c3" });
    expect(cooldownCalls[0]).toMatchObject({
      pieceId: "piece-123",
      actionId: "deployBomb",
      turns: 2,
    });
    expect(captureCalls[0]).toMatchObject({ pieceId: "enemy-7" });
  });
});
