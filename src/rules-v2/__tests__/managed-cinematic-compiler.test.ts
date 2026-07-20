import { describe, expect, it } from "vitest";
import { compileRuleBlueprint } from "../compiler";
import type { RuleBlueprintV2 } from "../types";

const arg = (
  name: string,
  kind: "string" | "number" | "boolean" | "string_list" | "token",
  value: string | number | boolean | string[],
) => ({
  name,
  kind,
  stringValue: kind === "string" || kind === "token" ? String(value) : "",
  numberValue: kind === "number" ? Number(value) : 0,
  booleanValue: kind === "boolean" ? Boolean(value) : false,
  stringListValue: kind === "string_list" ? (value as string[]) : [],
});

const managedResourceId =
  "cinematic.carry.asset_0123456789abcdef0123456789abcdef01234567.png";

const captureCinematicBlueprint: RuleBlueprintV2 = {
  schemaVersion: "2.0.0",
  ruleKey: "dragon-capture-cinematic",
  title: "Dragon des captures",
  summary:
    "Lorsqu'une pièce est capturée, un dragon vient l'emporter hors du plateau.",
  category: "capture",
  tags: ["capture", "dragon", "cinematic"],
  affectedPieces: ["any"],
  sides: ["white", "black"],
  stateNamespace: "dragon-capture-cinematic",
  initialStateJson: "{}",
  actions: [],
  triggers: [
    {
      id: "capture-cinematic",
      event: "lifecycle.onMoveCommitted",
      actionId: "",
      priority: 20,
      conditions: [
        {
          id: "captured-piece-present",
          op: "ctx.hasTargetPiece",
          arguments: [],
          negate: false,
        },
      ],
      effects: [
        {
          id: "play-dragon-cinematic",
          op: "vfx.play",
          arguments: [
            arg("sprite", "string", managedResourceId),
            arg("tile", "token", "$ctx.to"),
          ],
        },
      ],
      onFailure: "skip",
      message: "",
    },
  ],
  balance: {
    powerLevel: 1,
    counterplay: ["Effet purement visuel, sans impact sur la partie."],
    limitations: ["Une animation au maximum par capture validée."],
  },
  explanation: {
    plainLanguage:
      "Une animation de dragon apparaît uniquement après une capture réussie.",
    examples: ["Après Dxd5, le dragon emporte la pièce capturée sur d5."],
  },
};

describe("managed capture cinematics", () => {
  it("compile une animation d'asset géré limitée aux captures", () => {
    const result = compileRuleBlueprint(captureCinematicBlueprint);

    expect(result.ok).toBe(true);
    expect(result.compiledRule?.logic.effects[0].when).toBe(
      "lifecycle.onMoveCommitted",
    );
    expect(result.compiledRule?.logic.effects[0].if).toBe(
      "ctx.hasTargetPiece",
    );
    expect(result.compiledRule?.logic.effects[0].do).toEqual([
      {
        action: "vfx.play",
        params: {
          sprite: managedResourceId,
          tile: "$ctx.to",
        },
      },
    ]);
  });

  it("refuse une URL distante à la place d'un identifiant d'asset géré", () => {
    const invalid = structuredClone(captureCinematicBlueprint);
    invalid.triggers[0].effects[0].arguments[0] = arg(
      "sprite",
      "string",
      "https://evil.example/dragon.svg",
    );

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "RESOURCE_ID_INVALID"),
    ).toBe(true);
  });
});
