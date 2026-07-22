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

const validBlueprint: RuleBlueprintV2 = {
  schemaVersion: "2.0.0",
  ruleKey: "teleport-knight",
  title: "Cavalier quantique",
  summary:
    "Une fois tous les trois tours, un cavalier peut se téléporter sur une case vide.",
  category: "movement",
  tags: ["teleportation", "knight"],
  affectedPieces: ["knight"],
  sides: ["white", "black"],
  stateNamespace: "teleport-knight",
  initialStateJson: "{}",
  actions: [
    {
      id: "teleport",
      label: "Téléporter",
      description: "Déplace le cavalier sélectionné sur une case vide.",
      targetingMode: "tile",
      validTilesProvider: "provider.anyEmptyTile",
      consumesTurn: true,
      cooldownTurns: 3,
      maxPerPiece: 4,
      requiresSelection: true,
      pieceTypes: ["knight"],
    },
  ],
  triggers: [
    {
      id: "teleport-action",
      event: "ui.action",
      actionId: "teleport",
      priority: 10,
      conditions: [
        {
          id: "has-tile",
          op: "ctx.hasTargetTile",
          arguments: [],
          negate: false,
        },
        {
          id: "tile-empty",
          op: "tile.isEmpty",
          arguments: [],
          negate: false,
        },
      ],
      effects: [
        {
          id: "move",
          op: "piece.move",
          arguments: [
            arg("pieceId", "token", "$pieceId"),
            arg("to", "token", "$targetTile"),
          ],
        },
      ],
      onFailure: "blockAction",
      message: "Choisis une case vide.",
    },
  ],
  balance: {
    powerLevel: 3,
    counterplay: ["Forcer le cavalier à utiliser son pouvoir tôt."],
    limitations: ["Trois tours de recharge.", "Quatre usages par cavalier."],
  },
  explanation: {
    plainLanguage:
      "Sélectionne un cavalier, active Téléporter, puis choisis une case vide.",
    examples: ["Le cavalier de b1 peut rejoindre e5 si e5 est vide."],
  },
};

describe("compileRuleBlueprint", () => {
  it("compile un blueprint valide vers le DSL historique", () => {
    const result = compileRuleBlueprint(validBlueprint);

    expect(result.ok).toBe(true);
    expect(result.compiledRule?.meta.isActive).toBe(false);
    expect(result.compiledRule?.ui.actions[0].id).toBe(
      "teleport-knight.teleport",
    );
    expect(result.compiledRule?.logic.effects[0].when).toBe(
      "ui.teleport-knight.teleport",
    );
    expect(result.compiledRule?.logic.effects[0].if).toEqual([
      "and",
      "ctx.hasTargetTile",
      "tile.isEmpty",
    ]);
  });

  it("refuse les clés dangereuses dans l'état initial", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.initialStateJson =
      '{"safe":1,"constructor":{"prototype":{"polluted":true}}}';

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "BLUEPRINT_INITIAL_STATE_KEY",
      ),
    ).toBe(true);
  });

  it("refuse un argument inconnu", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects[0].arguments.push(
      arg("executeArbitraryCode", "string", "non"),
    );

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "UNKNOWN_ARGUMENT"),
    ).toBe(true);
  });

  it("refuse un token non autorisé", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects[0].arguments[0] = arg(
      "pieceId",
      "token",
      "$ctx.engine.secrets",
    );

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "UNSAFE_TOKEN"),
    ).toBe(true);
  });

  it("refuse une cible non protégée", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].conditions = [];

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "TARGET_TILE_NOT_GUARDED",
      ),
    ).toBe(true);
  });

  it("refuse un identifiant de pièce littéral inventé", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects[0].arguments[0] = arg(
      "pieceId",
      "string",
      "white-knight-1",
    );

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "PIECE_REFERENCE_REQUIRED",
      ),
    ).toBe(true);
  });

  it("refuse une case hors échiquier", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects[0].arguments[1] = arg("to", "string", "z99");

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "TILE_REFERENCE_INVALID"),
    ).toBe(true);
  });

  it("interdit de faire apparaître un second roi", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects = [
      {
        id: "spawn-king",
        op: "piece.spawn",
        arguments: [
          arg("type", "string", "king"),
          arg("side", "token", "$ctx.side"),
          arg("tile", "token", "$targetTile"),
        ],
      },
    ];

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "SPAWN_PIECE_TYPE_INVALID",
      ),
    ).toBe(true);
  });

  it("namespace l'identifiant d'action d'un cooldown", () => {
    const blueprint = structuredClone(validBlueprint);
    blueprint.triggers[0].conditions.push({
      id: "cooldown-ready",
      op: "cooldown.ready",
      arguments: [
        arg("pieceId", "token", "$pieceId"),
        arg("actionId", "string", "teleport"),
      ],
      negate: false,
    });
    blueprint.triggers[0].effects.push({
      id: "set-cooldown",
      op: "cooldown.set",
      arguments: [
        arg("pieceId", "token", "$pieceId"),
        arg("actionId", "string", "teleport"),
        arg("turns", "number", 3),
      ],
    });

    const result = compileRuleBlueprint(blueprint);

    expect(result.ok).toBe(true);
    expect(result.compiledRule?.logic.effects[0].do[1].params?.actionId).toBe(
      "teleport-knight.teleport",
    );
    expect(result.compiledRule?.logic.effects[0].if).toContainEqual([
      "cooldown.ready",
      {
        pieceId: "$pieceId",
        actionId: "teleport-knight.teleport",
      },
    ]);
  });

  it("refuse une condition cooldown vers une action non déclarée", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].conditions.push({
      id: "unknown-cooldown",
      op: "cooldown.ready",
      arguments: [arg("actionId", "string", "missing-action")],
      negate: false,
    });

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "UNKNOWN_COOLDOWN_ACTION",
      ),
    ).toBe(true);
  });

  it("exige une action explicite pour un cooldown de cycle de vie", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].event = "lifecycle.onEnterTile";
    invalid.triggers[0].actionId = "";
    invalid.triggers[0].conditions.push({
      id: "implicit-cooldown",
      op: "cooldown.ready",
      arguments: [],
      negate: false,
    });

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "COOLDOWN_ACTION_REQUIRED",
      ),
    ).toBe(true);
  });

  it.each(["lifecycle.onTurnStart", "lifecycle.onUndo"] as const)(
    "refuse cooldown.ready sans pièce source sur %s",
    (event) => {
      const invalid = structuredClone(validBlueprint);
      invalid.triggers[0].event = event;
      invalid.triggers[0].actionId = "";
      invalid.triggers[0].conditions = [
        {
          id: "cooldown-ready",
          op: "cooldown.ready",
          arguments: [arg("actionId", "string", "teleport")],
          negate: false,
        },
      ];
      invalid.triggers[0].effects = [
        {
          id: "notice",
          op: "ui.toast",
          arguments: [arg("message", "string", "Test")],
        },
      ];

      const result = compileRuleBlueprint(invalid);

      expect(result.ok).toBe(false);
      expect(
        result.diagnostics.some(
          (item) => item.code === "SOURCE_PIECE_UNAVAILABLE",
        ),
      ).toBe(true);
    },
  );

  it("refuse cooldown.ready sans sélection de pièce sur une action UI", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.actions[0].requiresSelection = false;
    invalid.triggers[0].conditions = [
      {
        id: "cooldown-ready",
        op: "cooldown.ready",
        arguments: [],
        negate: false,
      },
    ];
    invalid.triggers[0].effects = [
      {
        id: "notice",
        op: "ui.toast",
        arguments: [arg("message", "string", "Test")],
      },
    ];

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "SOURCE_PIECE_UNAVAILABLE",
      ),
    ).toBe(true);
  });

  it("refuse un token de condition indisponible pour l'événement", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].event = "lifecycle.onEnterTile";
    invalid.triggers[0].actionId = "";
    invalid.triggers[0].conditions = [
      {
        id: "cooldown-ready",
        op: "cooldown.ready",
        arguments: [
          arg("pieceId", "token", "$targetPieceId"),
          arg("actionId", "string", "teleport"),
        ],
        negate: false,
      },
    ];
    invalid.triggers[0].effects = [
      {
        id: "notice",
        op: "ui.toast",
        arguments: [arg("message", "string", "Test")],
      },
    ];

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "TOKEN_UNAVAILABLE_FOR_EVENT",
      ),
    ).toBe(true);
  });

  it("accepte le côté courant pour piece.isSide", () => {
    const blueprint = structuredClone(validBlueprint);
    blueprint.triggers[0].conditions.push({
      id: "current-side",
      op: "piece.isSide",
      arguments: [arg("side", "token", "$ctx.side")],
      negate: false,
    });

    const result = compileRuleBlueprint(blueprint);

    expect(result.ok).toBe(true);
    expect(result.compiledRule?.logic.effects[0].if).toContainEqual([
      "piece.isSide",
      { side: "$ctx.side" },
    ]);
  });

  it("refuse une valeur de côté non sémantique pour piece.isSide", () => {
    const blueprint = structuredClone(validBlueprint);
    blueprint.triggers[0].conditions.push({
      id: "invalid-side",
      op: "piece.isSide",
      arguments: [arg("side", "number", 1)],
      negate: false,
    });

    const result = compileRuleBlueprint(blueprint);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "SIDE_REFERENCE_INVALID"),
    ).toBe(true);

    blueprint.triggers[0].conditions[1].arguments[0] = arg(
      "side",
      "token",
      "$pieceId",
    );
    const invalidTokenResult = compileRuleBlueprint(blueprint);
    expect(
      invalidTokenResult.diagnostics.some(
        (item) => item.code === "SIDE_REFERENCE_INVALID",
      ),
    ).toBe(true);
  });

  it("refuse un provider de pièces pour une cible case", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.actions[0].validTilesProvider = "provider.enemyPieces";

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "TARGET_PROVIDER_TYPE_MISMATCH",
      ),
    ).toBe(true);
  });

  it("exige une sélection pour un provider contextuel", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.actions[0].validTilesProvider = "provider.neighborsEmpty";
    invalid.actions[0].requiresSelection = false;

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "TARGET_PROVIDER_REQUIRES_PIECE",
      ),
    ).toBe(true);
  });

  it("refuse un cooldown vers une action non déclarée", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects.push({
      id: "unknown-cooldown",
      op: "cooldown.set",
      arguments: [
        arg("pieceId", "token", "$pieceId"),
        arg("actionId", "string", "missing-action"),
        arg("turns", "number", 2),
      ],
    });

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "UNKNOWN_COOLDOWN_ACTION",
      ),
    ).toBe(true);
  });

  it("refuse un type de piège sans implémentation moteur", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.triggers[0].effects = [
      {
        id: "unknown-trap",
        op: "tile.setTrap",
        arguments: [
          arg("tile", "token", "$targetTile"),
          arg("kind", "string", "arbitrary-trap"),
        ],
      },
    ];

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some((item) => item.code === "TRAP_KIND_INVALID"),
    ).toBe(true);
  });

  it("refuse un token de pièce sans sélection source", () => {
    const invalid = structuredClone(validBlueprint);
    invalid.actions[0].requiresSelection = false;

    const result = compileRuleBlueprint(invalid);

    expect(result.ok).toBe(false);
    expect(
      result.diagnostics.some(
        (item) => item.code === "TOKEN_UNAVAILABLE_FOR_EVENT",
      ),
    ).toBe(true);
  });

  it("préserve la priorité individuelle de chaque trigger", () => {
    const blueprint = structuredClone(validBlueprint);
    blueprint.triggers.push({
      ...structuredClone(blueprint.triggers[0]),
      id: "secondary-trigger",
      priority: 3,
    });
    blueprint.triggers[0].priority = 17;

    const result = compileRuleBlueprint(blueprint);

    expect(result.ok).toBe(true);
    expect(
      result.compiledRule?.logic.effects.map((step) => step.priority),
    ).toEqual([17, 3]);
  });
});
