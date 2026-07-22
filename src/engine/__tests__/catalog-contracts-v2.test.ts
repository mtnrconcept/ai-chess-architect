import { describe, expect, it, vi } from "vitest";
import {
  CONDITION_CATALOG,
  EFFECT_CATALOG,
  PROVIDER_CATALOG,
} from "../../rules-v2/catalog";
import {
  CONDITION_OPS,
  EFFECT_OPS,
  PROVIDERS,
  RuntimeBudget,
  RuntimeBudgetExceededError,
  type ConditionOp,
  type EffectOp,
  type ProviderId,
} from "../../rules-v2";
import { Cooldown } from "../cooldown";
import { ChessBoardAdapter } from "../adapters/chessBoardAdapter";
import { RuleEngine } from "../engine";
import { registerBuiltinConditions } from "../builtins/conditions";
import { registerBuiltinEffects } from "../builtins/effects";
import { registerBuiltinProviders } from "../builtins/providers";
import { Registry, type EngineContext } from "../registry";
import type { ConditionDescriptor } from "../registry";
import { StateStore } from "../stateStore";
import type { EngineContracts, Piece, RuleJSON, Tile } from "../types";

const tilePattern = /^[a-h][1-8]$/;

function allTiles(): Tile[] {
  return Array.from({ length: 64 }, (_, index) => {
    const column = index % 8;
    const row = Math.floor(index / 8);
    return `${String.fromCharCode(97 + column)}${8 - row}`;
  });
}

function neighbors(tile: Tile, radius = 1): Tile[] {
  const column = tile.charCodeAt(0) - 97;
  const row = 8 - Number.parseInt(tile[1], 10);
  return allTiles().filter((candidate) => {
    const candidateColumn = candidate.charCodeAt(0) - 97;
    const candidateRow = 8 - Number.parseInt(candidate[1], 10);
    const distance = Math.max(
      Math.abs(candidateColumn - column),
      Math.abs(candidateRow - row),
    );
    return distance > 0 && distance <= radius;
  });
}

function createHarness() {
  let pieces = new Map<string, Piece>([
    [
      "source",
      {
        id: "source",
        type: "pawn",
        side: "white",
        tile: "a2",
        hasMoved: false,
        statuses: { ready: true },
      },
    ],
    [
      "ally",
      {
        id: "ally",
        type: "knight",
        side: "white",
        tile: "b2",
        statuses: { frozen: { active: true, duration: 2 } },
      },
    ],
    [
      "enemy",
      {
        id: "enemy",
        type: "rook",
        side: "black",
        tile: "a3",
        statuses: { marked: true },
      },
    ],
  ]);
  let decals = new Map<string, string>();
  let nextPiece = 1;
  const state = new StateStore();
  const cooldown = new Cooldown();
  const toast = vi.fn();
  const animation = vi.fn();
  const audio = vi.fn();
  const endTurn = vi.fn();

  const board: EngineContracts["board"] = {
    tiles: allTiles,
    isEmpty: (tile) =>
      !Array.from(pieces.values()).some((piece) => piece.tile === tile),
    getPieceAt: (tile) =>
      Array.from(pieces.values()).find((piece) => piece.tile === tile)?.id ??
      null,
    getPiece: (id) => {
      const piece = pieces.get(id);
      if (!piece) throw new Error(`missing piece ${id}`);
      return piece;
    },
    setPieceTile: (id, tile) => {
      const piece = board.getPiece(id);
      if (!board.isEmpty(tile)) throw new Error("occupied");
      piece.tile = tile;
    },
    removePiece: (id) => {
      if (!pieces.delete(id)) throw new Error("missing piece");
    },
    spawnPiece: (type, side, tile) => {
      if (!board.isEmpty(tile)) throw new Error("occupied");
      const id = `spawn-${nextPiece++}`;
      pieces.set(id, { id, type, side, tile, statuses: {} });
      return id;
    },
    setPieceInvisible: (id, value) => {
      board.getPiece(id).invisible = value;
    },
    setPieceStatus: (id, key, value) => {
      const piece = board.getPiece(id);
      piece.statuses ??= {};
      piece.statuses[key] = structuredClone(value);
    },
    clearPieceStatus: (id, key) => {
      delete board.getPiece(id).statuses?.[key];
    },
    withinBoard: (tile) => tilePattern.test(tile),
    neighbors,
    setDecal: (tile, sprite) => {
      if (sprite === null) decals.delete(tile);
      else decals.set(tile, sprite);
    },
    clearDecal: (tile) => {
      decals.delete(tile);
    },
    serialize: () =>
      JSON.stringify({
        pieces: Array.from(pieces.entries()),
        decals: Array.from(decals.entries()),
        nextPiece,
      }),
    deserialize: (payload) => {
      const value = JSON.parse(payload) as {
        pieces: Array<[string, Piece]>;
        decals: Array<[string, string]>;
        nextPiece: number;
      };
      pieces = new Map(value.pieces);
      decals = new Map(value.decals);
      nextPiece = value.nextPiece;
    },
  };

  const contracts: EngineContracts = {
    board,
    state,
    cooldown,
    ui: { toast, registerAction: vi.fn() },
    vfx: {
      spawnDecal: vi.fn(),
      clearDecal: vi.fn(),
      playAnimation: animation,
      playAudio: audio,
    },
    match: {
      get: () => ({ ply: 4, turnSide: "white" }),
      setTurn: vi.fn(),
      endTurn,
    },
    util: { uuid: () => "00000000-0000-4000-8000-000000000001" },
    capturePiece: (pieceId) => board.removePiece(pieceId),
    eventBus: { emit: vi.fn(), on: vi.fn() },
  };

  return { contracts, state, toast, animation, audio, endTurn };
}

function createRegistry(): Registry {
  const registry = new Registry();
  registerBuiltinConditions(registry);
  registerBuiltinEffects(registry);
  registerBuiltinProviders(registry);
  return registry;
}

function contextFor(contracts: EngineContracts): EngineContext {
  return {
    engine: contracts,
    pieceId: "source",
    piece: contracts.board.getPiece("source"),
    targetTile: "a3",
    targetPieceId: "enemy",
    baseActionId: "rule.action",
    rule: {
      meta: { ruleId: "contract", ruleName: "Contract" },
      scope: { affectedPieces: ["pawn"] },
    },
    state: { count: 1, nested: { value: "yes" } },
    params: {},
    random: () => 0,
    budget: new RuntimeBudget(256, 8),
    turnEnded: false,
  };
}

const conditionParams: Record<
  ConditionOp,
  Record<string, unknown> | undefined
> = {
  always: undefined,
  "ctx.hasTargetTile": undefined,
  "ctx.hasTargetPiece": undefined,
  "cooldown.ready": { pieceId: "source", actionId: "rule.action" },
  "tile.isEmpty": undefined,
  "tile.withinBoard": undefined,
  "piece.isTypeInScope": undefined,
  "piece.hasMoved.equals": { expected: false },
  "status.targetNotFrozen": undefined,
  "piece.exists": undefined,
  "piece.isSide": { side: "white" },
  "piece.hasStatus": { key: "ready" },
  "target.hasStatus": { key: "marked" },
  "target.isEnemy": undefined,
  "target.isFriendly": undefined,
  "state.exists": { path: "nested.value" },
  "state.equals": { path: "count", value: 1 },
  "state.lessThan": { path: "count", value: 2 },
  "random.chance": { percent: 100 },
  "match.turnNumber.atLeast": { value: 2 },
  "match.turnNumber.lessThan": { value: 8 },
};

const effectParams: Record<EffectOp, Record<string, unknown>> = {
  "vfx.play": { sprite: "spark", tile: "b3" },
  "audio.play": { id: "move" },
  "decal.set": { tile: "b3", sprite: "marker" },
  "decal.clear": { tile: "b3" },
  "turn.end": {},
  "cooldown.set": { pieceId: "source", actionId: "rule.action", turns: 2 },
  "piece.capture": { pieceId: "enemy", reason: "test" },
  "piece.move": { pieceId: "source", to: "b3" },
  "piece.spawn": { type: "pawn", side: "white", tile: "b3" },
  "piece.promote": { pieceId: "source", toType: "queen" },
  "piece.duplicate": { sourceId: "source", tile: "b3" },
  "piece.setInvisible": { pieceId: "source", value: true },
  "piece.setStatus": { pieceId: "source", key: "shielded", value: true },
  "piece.clearStatus": { pieceId: "source", key: "ready" },
  "tile.setTrap": { tile: "b3", kind: "quicksand" },
  "tile.clearTrap": { tile: "b3" },
  "tile.resolveTrap": { tile: "a3", persistent: false },
  "ui.toast": { message: "ok" },
  "status.add": { pieceId: "source", key: "shielded", duration: 2 },
  "status.remove": { pieceId: "source", key: "ready" },
  "state.set": { path: "flags.enabled", value: true },
  "state.inc": { path: "count", by: 1, default: 0 },
  "state.delete": { path: "nested.value" },
};

function versionedRule(
  ruleId: string,
  actions: Array<{ action: string; params?: Record<string, unknown> }>,
): RuleJSON {
  return {
    meta: { ruleId, ruleName: ruleId, isActive: true },
    scope: { affectedPieces: ["any"], sides: ["white", "black"] },
    ui: { actions: [] },
    state: { namespace: "rules.shared", initial: {}, serialize: true },
    logic: {
      effects: [
        {
          id: "step",
          when: "lifecycle.onEnterTile",
          do: actions,
          onFail: "blockAction",
        },
      ],
    },
    integration: {
      ruleArchitect: { source: "ai-blueprint" },
    },
  } as RuleJSON;
}

describe("Rule Architect V2 catalog contracts", () => {
  it("enregistre et exécute chaque condition exposée", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();

    expect(
      [...registry.conditions.keys()].filter((id) =>
        CONDITION_OPS.includes(id as ConditionOp),
      ),
    ).toEqual(expect.arrayContaining([...CONDITION_OPS]));
    expect(Object.keys(CONDITION_CATALOG)).toEqual([...CONDITION_OPS]);

    for (const operation of CONDITION_OPS) {
      const params = conditionParams[operation];
      const descriptor: ConditionDescriptor =
        params === undefined ? operation : [operation, params];
      expect(
        typeof registry.runCondition(descriptor, contextFor(contracts)),
      ).toBe("boolean");
    }
  });

  it("résout $ctx.side avant d'évaluer piece.isSide", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const context = contextFor(contracts);
    context.side = "white";

    expect(
      registry.runCondition(["piece.isSide", { side: "$ctx.side" }], context),
    ).toBe(true);

    context.side = "black";
    expect(
      registry.runCondition(["piece.isSide", { side: "$ctx.side" }], context),
    ).toBe(false);

    context.side = "white";
    expect(
      registry.runCondition(["piece.isSide", { side: "white" }], context),
    ).toBe(true);

    delete context.side;
    expect(
      registry.runCondition(["piece.isSide", { side: "$ctx.side" }], context),
    ).toBe(false);
  });

  it("respecte le type de cible de chaque provider exposé", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const context = contextFor(contracts);

    for (const id of PROVIDERS.filter((provider) => provider !== "none")) {
      const values = registry.runProvider(id, context);
      expect(Array.isArray(values), id).toBe(true);
      expect(new Set(values as unknown[]).size, id).toBe(
        (values as unknown[]).length,
      );

      const spec = PROVIDER_CATALOG[id as ProviderId];
      for (const value of values as unknown[]) {
        expect(typeof value, id).toBe("string");
        if (spec.targetModes.includes("piece")) {
          expect(
            () => contracts.board.getPiece(value as string),
            id,
          ).not.toThrow();
        } else {
          expect(tilePattern.test(value as string), id).toBe(true);
        }
      }
    }
  });

  it("exécute chaque effet V2 avec un contrat valide et refuse les paramètres manquants", () => {
    expect(Object.keys(EFFECT_CATALOG)).toEqual([...EFFECT_OPS]);

    for (const operation of EFFECT_OPS) {
      const registry = createRegistry();
      const { contracts } = createHarness();
      const context = contextFor(contracts);
      if (operation === "tile.resolveTrap") {
        context.state.traps = { a3: { kind: "quicksand", owner: "white" } };
      }
      expect(
        registry.runEffect(
          { action: operation, params: effectParams[operation] },
          context,
        ),
        operation,
      ).toBe(true);
    }

    const registry = createRegistry();
    const { contracts } = createHarness();
    expect(
      registry.runEffect(
        { action: "piece.move", params: {} },
        contextFor(contracts),
      ),
    ).toBe(false);
  });

  it("persiste invisibilité et statuts dans le plateau réel, y compris après snapshot", () => {
    const rawBoard = Array.from({ length: 8 }, () =>
      Array.from({ length: 8 }, () => null),
    ) as ConstructorParameters<typeof ChessBoardAdapter>[0];
    rawBoard[6][0] = {
      type: "pawn",
      color: "white",
      position: { row: 6, col: 0 },
      hasMoved: false,
      isHidden: false,
    };
    const board = new ChessBoardAdapter(rawBoard);
    const pieceId = board.getPieceAt("a2")!;
    const { contracts } = createHarness();
    contracts.board = board;
    contracts.capturePiece = (id) => board.removePiece(id);
    const registry = createRegistry();
    const context: EngineContext = {
      engine: contracts,
      pieceId,
      piece: board.getPiece(pieceId),
      state: {},
      params: {},
      budget: new RuntimeBudget(32, 8),
      turnEnded: false,
    };

    expect(
      registry.runEffect(
        {
          action: "piece.setInvisible",
          params: { pieceId, value: true },
        },
        context,
      ),
    ).toBe(true);
    expect(
      registry.runEffect(
        {
          action: "piece.setStatus",
          params: { pieceId, key: "shielded", value: true },
        },
        context,
      ),
    ).toBe(true);

    const snapshot = board.serialize();
    expect(rawBoard[6][0]?.isHidden).toBe(true);
    expect(rawBoard[6][0]?.specialState?.shielded).toBe(true);

    board.setPieceInvisible(pieceId, false);
    board.clearPieceStatus(pieceId, "shielded");
    board.deserialize(snapshot);
    expect(rawBoard[6][0]?.isHidden).toBe(true);
    expect(rawBoard[6][0]?.specialState?.shielded).toBe(true);
  });

  it("restaure plateau, état et effets différés si une étape échoue", () => {
    const registry = createRegistry();
    registry.registerEffect("audio.play", () => false);
    const { contracts, state, toast } = createHarness();
    const engine = new RuleEngine(contracts, registry, { matchSeed: "atomic" });
    engine.loadRules([
      versionedRule("atomic@v1", [
        { action: "state.set", params: { path: "changed", value: true } },
        { action: "piece.move", params: { pieceId: "$pieceId", to: "b3" } },
        { action: "ui.toast", params: { message: "must-not-leak" } },
        { action: "audio.play", params: { id: "forced-failure" } },
      ]),
    ]);

    engine.onEnterTile("source", "b3");

    expect(contracts.board.getPiece("source").tile).toBe("a2");
    expect(state.serialize()).not.toContain("changed");
    expect(toast).not.toHaveBeenCalledWith("must-not-leak");
  });

  it("restaure les mutations lorsque le budget est dépassé", () => {
    const registry = createRegistry();
    const { contracts, state } = createHarness();
    const engine = new RuleEngine(contracts, registry, {
      matchSeed: "budget",
      maxEffectsPerRuleEvent: 1,
    });
    engine.loadRules([
      versionedRule("budget@v1", [
        { action: "state.inc", params: { path: "count", by: 1, default: 0 } },
        { action: "state.inc", params: { path: "count", by: 1, default: 0 } },
      ]),
    ]);

    engine.onEnterTile("source", "b3");

    expect(state.serialize()).not.toContain("count");
  });

  it("applique la profondeur maximale aux appels imbriqués", () => {
    const registry = new Registry();
    registry.registerEffect("test.recursive", (ctx) =>
      registry.runEffect({ action: "test.recursive" }, ctx),
    );
    const { contracts } = createHarness();
    const context = contextFor(contracts);
    context.budget = new RuntimeBudget(100, 2);

    expect(() =>
      registry.runEffect({ action: "test.recursive" }, context),
    ).toThrow(RuntimeBudgetExceededError);
  });

  it("isole les IDs d'action et namespaces de deux versions", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const actionRule = (ruleId: string): RuleJSON => ({
      ...versionedRule(ruleId, [
        { action: "state.set", params: { path: "used", value: ruleId } },
      ]),
      ui: {
        actions: [
          {
            id: "shared.action",
            label: "Action",
            targeting: { mode: "none" },
            consumesTurn: false,
          },
        ],
      },
      logic: {
        effects: [
          {
            id: "ui-step",
            when: "ui.shared.action",
            do: [
              { action: "state.set", params: { path: "used", value: ruleId } },
            ],
            onFail: "blockAction",
          },
        ],
      },
    });
    const engine = new RuleEngine(contracts, registry, {
      matchSeed: "versions",
    });
    engine.loadRules([actionRule("shared@v1"), actionRule("shared@v2")]);

    const actionIds = engine.getUIActions().map((action) => action.id);
    const namespaces = engine.getRules().map((rule) => rule.state?.namespace);
    expect(new Set(actionIds).size).toBe(2);
    expect(new Set(namespaces).size).toBe(2);
    expect(actionIds).toContain("shared@v1::shared.action");
    expect(actionIds).toContain("shared@v2::shared.action");
  });

  it("isole cooldown.ready et cooldown.set entre deux versions", () => {
    const registry = createRegistry();
    const { contracts, state } = createHarness();
    const cooldownRule = (ruleId: string): RuleJSON => {
      const rule = versionedRule(ruleId, [
        {
          action: "state.inc",
          params: { path: "count", by: 1, default: 0 },
        },
        {
          action: "cooldown.set",
          params: {
            pieceId: "$pieceId",
            actionId: "shared.action",
            turns: 2,
          },
        },
      ]);
      rule.ui = {
        actions: [
          {
            id: "shared.action",
            label: "Action de cooldown",
            targeting: { mode: "none" },
            consumesTurn: false,
          },
        ],
      };
      rule.logic.effects[0].if = [
        "and",
        [
          "not",
          [
            "not",
            [
              "cooldown.ready",
              { pieceId: "$pieceId", actionId: "shared.action" },
            ],
          ],
        ],
      ];
      rule.logic.effects[0].onFail = "skip";
      return rule;
    };

    const engine = new RuleEngine(contracts, registry, {
      matchSeed: "cooldown-scope",
    });
    engine.loadRules([
      cooldownRule("cooldown@v1"),
      cooldownRule("cooldown@v2"),
    ]);
    contracts.cooldown.set("source", "cooldown@v1::shared.action", 2);

    engine.onEnterTile("source", "b3");

    expect(state.getOrInit("rules.shared::cooldown@v1", {})).not.toMatchObject({
      count: 1,
    });
    expect(state.getOrInit("rules.shared::cooldown@v2", {})).toMatchObject({
      count: 1,
    });
    expect(
      contracts.cooldown.isReady("source", "cooldown@v2::shared.action"),
    ).toBe(false);
  });

  it("réserve le cooldown implicite aux actions UI", () => {
    const registry = createRegistry();
    const { contracts, state } = createHarness();
    const uiRule = versionedRule("implicit-ui@v1", [
      {
        action: "state.inc",
        params: { path: "count", by: 1, default: 0 },
      },
    ]);
    uiRule.integration!.ruleArchitect!.blueprintRuleKey = "implicit-ui";
    uiRule.ui = {
      actions: [
        {
          id: "implicit-ui.action",
          label: "Action implicite",
          availability: { requiresSelection: true },
          targeting: { mode: "none" },
          consumesTurn: false,
        },
      ],
    };
    uiRule.logic!.effects![0].when = "ui.implicit-ui.action";
    uiRule.logic!.effects![0].if = "cooldown.ready";

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([uiRule]);
    const scopedActionId = engine.getUIActions()[0].id;
    contracts.cooldown.set("source", scopedActionId, 2);

    expect(engine.runUIAction(scopedActionId, "source").ok).toBe(false);
    contracts.cooldown.set("source", scopedActionId, 0);
    expect(engine.runUIAction(scopedActionId, "source").ok).toBe(true);
    expect(state.getOrInit("rules.shared::implicit-ui@v1", {})).toMatchObject({
      count: 1,
    });

    const lifecycleRule = versionedRule("implicit-lifecycle@v1", [
      {
        action: "state.inc",
        params: { path: "count", by: 1, default: 0 },
      },
    ]);
    lifecycleRule.logic!.effects![0].if = ["not", "cooldown.ready"];
    const lifecycleEngine = new RuleEngine(contracts, registry);
    lifecycleEngine.loadRules([lifecycleRule]);
    expect(lifecycleEngine.getRules()).toHaveLength(0);
  });

  it("isole le cooldown natif pour chaque pièce sélectionnée", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const rule = versionedRule("per-piece-cooldown@v1", [
      {
        action: "state.inc",
        params: { path: "count", by: 1, default: 0 },
      },
    ]);
    rule.ui = {
      actions: [
        {
          id: "per-piece-cooldown.teleport",
          label: "Téléporter",
          availability: { requiresSelection: true },
          targeting: { mode: "none" },
          cooldown: { perPiece: 3 },
          consumesTurn: true,
        },
      ],
    };
    rule.logic!.effects![0].when = "ui.per-piece-cooldown.teleport";

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([rule]);
    const actionId = engine.getUIActions()[0].id;

    expect(engine.runUIAction(actionId, "source").ok).toBe(true);
    expect(engine.runUIAction(actionId, "source").ok).toBe(false);
    expect(engine.runUIAction(actionId, "ally").ok).toBe(true);

    engine.onTurnStart("black");
    engine.onTurnStart("white");
    expect(engine.runUIAction(actionId, "source").ok).toBe(false);
    engine.onTurnStart("black");
    expect(engine.runUIAction(actionId, "source").ok).toBe(true);
  });

  it("refuse les identifiants d'action V2 mal formés sans planter", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const invalid = versionedRule("invalid-action@v1", [
      { action: "ui.toast", params: { message: "Test" } },
    ]);
    invalid.ui = {
      actions: [
        {
          id: 42 as unknown as string,
          label: "Action invalide",
          targeting: { mode: "none" },
          consumesTurn: false,
        },
      ],
    };
    const engine = new RuleEngine(contracts, registry);

    expect(() => engine.loadRules([invalid])).not.toThrow();
    expect(engine.getRules()).toHaveLength(0);
  });

  it("accepte uniquement l'alias cooldown historique dérivé du ruleKey", () => {
    const registry = createRegistry();
    const { contracts, state } = createHarness();
    const rule = versionedRule("legacy-cooldown@v1", [
      {
        action: "state.inc",
        params: { path: "count", by: 1, default: 0 },
      },
      {
        action: "cooldown.set",
        params: {
          pieceId: "$pieceId",
          actionId: "shared.action",
          turns: 2,
        },
      },
    ]);
    rule.integration!.ruleArchitect!.blueprintRuleKey = "shared";
    rule.ui = {
      actions: [
        {
          id: "shared.action",
          label: "Action historique",
          targeting: { mode: "none" },
          consumesTurn: false,
        },
      ],
    };
    rule.logic!.effects![0].if = [
      "cooldown.ready",
      { pieceId: "$pieceId", actionId: "action" },
    ];

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([rule]);
    engine.onEnterTile("source", "b3");

    expect(
      state.getOrInit("rules.shared::legacy-cooldown@v1", {}),
    ).toMatchObject({ count: 1 });
    expect(
      contracts.cooldown.isReady("source", "legacy-cooldown@v1::shared.action"),
    ).toBe(false);

    const tampered = structuredClone(rule);
    tampered.meta.ruleId = "legacy-cooldown@v2";
    tampered.integration!.ruleArchitect!.blueprintRuleKey = "other";
    const rejectedEngine = new RuleEngine(contracts, registry);
    rejectedEngine.loadRules([tampered]);
    expect(rejectedEngine.getRules()).toHaveLength(0);

    const ambiguous = structuredClone(rule);
    ambiguous.meta.ruleId = "legacy-cooldown@v3";
    ambiguous.ui!.actions!.unshift({
      id: "action",
      label: "Collision historique",
      targeting: { mode: "none" },
      consumesTurn: false,
    });
    const ambiguousEngine = new RuleEngine(contracts, registry);
    ambiguousEngine.loadRules([ambiguous]);
    expect(ambiguousEngine.getRules()).toHaveLength(0);

    const positional = structuredClone(rule);
    positional.meta.ruleId = "legacy-cooldown@v4";
    positional.logic!.effects![0].if = [
      "cooldown.ready",
      "$pieceId",
      "shared.action",
    ];
    const positionalEngine = new RuleEngine(contracts, registry);
    positionalEngine.loadRules([positional]);
    expect(positionalEngine.getRules()).toHaveLength(0);
  });

  it("refuse une règle V2 altérée avec un effet hors catalogue", () => {
    const registry = createRegistry();
    const { contracts } = createHarness();
    const engine = new RuleEngine(contracts, registry);

    engine.loadRules([
      versionedRule("tampered@v1", [{ action: "state.pushUndo" }]),
    ]);

    expect(engine.getRules()).toHaveLength(0);
  });
});
