import { describe, expect, it, vi } from "vitest";
import { RuleEngine } from "../engine";
import { Registry, type EngineContext } from "../registry";
import type { EngineContracts, RuleJSON } from "../types";
import { RuntimeBudget, RuntimeBudgetExceededError } from "../../rules-v2";

function createContracts(): EngineContracts {
  const namespaces = new Map<string, Record<string, unknown>>();

  return {
    board: {
      getPiece: (id: string) => ({
        id,
        type: "pawn",
        side: "white",
        tile: "a2",
        statuses: {},
      }),
      getPieceAt: () => null,
      isEmpty: () => true,
      withinBoard: () => true,
      removePiece: vi.fn(),
      serialize: () => "{}",
      deserialize: vi.fn(),
    },
    ui: {
      registerAction: vi.fn(),
      unregisterAction: vi.fn(),
      toast: vi.fn(),
    },
    vfx: {},
    match: {
      endTurn: vi.fn(),
      get: () => ({ ply: 0, turnSide: "white" }),
    },
    cooldown: {
      tickAll: vi.fn(),
      isReady: () => true,
      set: vi.fn(),
      serialize: () => "{}",
      deserialize: vi.fn(),
    },
    state: {
      getOrInit: (namespace: string, initial: Record<string, unknown>) => {
        const current = namespaces.get(namespace) ?? {
          ...initial,
        };
        namespaces.set(namespace, current);
        return current;
      },
      serialize: () => "{}",
      deserialize: vi.fn(),
    },
    eventBus: {
      on: vi.fn(),
      emit: vi.fn(),
    },
    util: {
      uuid: () => "00000000-0000-4000-8000-000000000001",
    },
    capturePiece: vi.fn(),
  } as unknown as EngineContracts;
}

function lifecycleRule(
  actions: Array<{
    action: string;
    params?: Record<string, unknown>;
  }>,
): RuleJSON {
  return {
    meta: {
      ruleId: "hardening-test@v1",
      ruleName: "Hardening test",
      version: "2.0.0",
      description: "Test",
      category: "special",
      priority: 1,
      isActive: true,
      tags: [],
    },
    scope: {
      affectedPieces: ["any"],
      sides: ["white", "black"],
    },
    ui: { actions: [] },
    state: {
      namespace: "rules.hardening-test",
      schema: {},
      initial: {},
      serialize: true,
    },
    logic: {
      effects: [
        {
          id: "on-enter",
          when: "lifecycle.onEnterTile",
          do: actions,
          onFail: "blockAction",
        },
      ],
    },
  } as unknown as RuleJSON;
}

function globalRuleArchitectRule(
  sides: Array<"white" | "black"> = ["white"],
): RuleJSON {
  return {
    meta: {
      ruleId: "global-action@v1",
      ruleName: "Global action",
      version: "2.0.0",
      description: "Test",
      category: "special",
      priority: 1,
      isActive: true,
      tags: [],
    },
    scope: {
      affectedPieces: ["any"],
      sides,
    },
    ui: {
      actions: [
        {
          id: "global-action.activate",
          label: "Activate",
          availability: {
            requiresSelection: false,
            pieceTypes: ["any"],
          },
          targeting: { mode: "none" },
          cooldown: { perPiece: 2 },
          maxPerPiece: 1,
        },
      ],
    },
    state: {
      namespace: "rules.global-action",
      schema: {},
      initial: {},
      serialize: true,
    },
    logic: {
      effects: [
        {
          id: "activate",
          when: "ui.global-action.activate",
          do: { action: "state.inc" },
          onFail: "blockAction",
        },
      ],
    },
    integration: { ruleArchitect: { source: "ai-blueprint" } },
  } as unknown as RuleJSON;
}

describe("RuleEngine V2 hardening", () => {
  it("échoue fermé pour une condition inconnue", () => {
    const registry = new Registry();
    const context = {
      engine: {},
      state: {},
    } as EngineContext;

    expect(registry.runCondition("condition.inconnue", context)).toBe(false);
  });

  it("refuse tout le bloc avant une mutation si un effet est inconnu", () => {
    const registry = new Registry();
    let mutations = 0;
    registry.registerEffect("test.mutate", () => {
      mutations += 1;
    });

    const engine = new RuleEngine(createContracts(), registry, {
      matchSeed: "match-42",
    });
    engine.loadRules([
      lifecycleRule([{ action: "test.mutate" }, { action: "effect.inconnu" }]),
    ]);

    engine.onEnterTile("pawn-a2", "a3");

    expect(mutations).toBe(0);
  });

  it("bloque les anciens effets récursifs même s'ils sont enregistrés", () => {
    const registry = new Registry();
    const recursive = vi.fn();
    registry.registerEffect("composite", recursive);

    const engine = new RuleEngine(createContracts(), registry, {
      matchSeed: "match-42",
    });
    engine.loadRules([lifecycleRule([{ action: "composite" }])]);

    engine.onEnterTile("pawn-a2", "a3");

    expect(recursive).not.toHaveBeenCalled();
  });

  it("interrompt l'exécution lorsque le budget est dépassé", () => {
    const registry = new Registry();
    registry.registerCondition("always", () => true);
    const context = {
      engine: {},
      state: {},
      budget: new RuntimeBudget(1, 2),
    } as EngineContext;

    expect(registry.runCondition("always", context)).toBe(true);
    expect(() => registry.runCondition("always", context)).toThrow(
      RuntimeBudgetExceededError,
    );
  });

  it("n’avance pas l’aléatoire après une cible rejetée", () => {
    const run = (attemptInvalidTarget: boolean): number => {
      const registry = new Registry();
      let sampled = -1;
      registry.registerProvider("provider.anyEmptyTile", () => ["a3"]);
      registry.registerEffect("state.inc", (context) => {
        sampled = context.random?.() ?? -1;
      });
      const engine = new RuleEngine(createContracts(), registry, {
        matchSeed: "match-seed",
      });
      engine.loadRules([
        {
          meta: {
            ruleId: "random-target@v1",
            ruleName: "Random target",
            priority: 1,
            isActive: true,
          },
          scope: { affectedPieces: ["pawn"], sides: ["white"] },
          ui: {
            actions: [
              {
                id: "random-target.action",
                label: "Action",
                availability: {
                  requiresSelection: true,
                  pieceTypes: ["pawn"],
                },
                targeting: {
                  mode: "tile",
                  validTilesProvider: "provider.anyEmptyTile",
                },
              },
            ],
          },
          state: {
            namespace: "rules.random-target",
            initial: {},
          },
          logic: {
            effects: [
              {
                id: "sample",
                when: "ui.random-target.action",
                do: { action: "state.inc" },
              },
            ],
          },
          integration: { ruleArchitect: { source: "ai-blueprint" } },
        },
      ]);
      const actionId = engine.getUIActions()[0].id;

      if (attemptInvalidTarget) {
        engine.runUIAction(actionId, "pawn-a2", "h8");
      }
      engine.runUIAction(actionId, "pawn-a2", "a3");
      return sampled;
    };

    expect(run(true)).toBe(run(false));
  });

  it("exécute les triggers d’un même événement selon leur priorité", () => {
    const registry = new Registry();
    const executionOrder: string[] = [];
    registry.registerEffect("test.high", () => {
      executionOrder.push("high");
    });
    registry.registerEffect("test.low", () => {
      executionOrder.push("low");
    });
    const engine = new RuleEngine(createContracts(), registry, {
      matchSeed: "match-seed",
    });
    const rule = lifecycleRule([{ action: "test.low" }]);
    rule.logic!.effects = [
      { ...rule.logic!.effects![0], id: "low", priority: 1 },
      {
        ...rule.logic!.effects![0],
        id: "high",
        priority: 10,
        do: [{ action: "test.high" }],
      },
    ];
    engine.loadRules([rule]);

    engine.onEnterTile("pawn-a2", "a3");

    expect(executionOrder).toEqual(["high", "low"]);
  });

  it("applique automatiquement les scopes de pièce et de camp aux lifecycle", () => {
    const registry = new Registry();
    const executed: string[] = [];
    registry.registerEffect("test.matching", () => {
      executed.push("matching");
    });
    registry.registerEffect("test.wrong-piece", () => {
      executed.push("wrong-piece");
    });
    registry.registerEffect("test.wrong-side", () => {
      executed.push("wrong-side");
    });

    const scopedRule = (
      ruleId: string,
      affectedPieces: string[],
      sides: Array<"white" | "black">,
      action: string,
    ) => {
      const rule = lifecycleRule([{ action }]);
      rule.meta.ruleId = ruleId;
      rule.scope = { affectedPieces, sides };
      return rule;
    };

    const engine = new RuleEngine(createContracts(), registry);
    engine.loadRules([
      scopedRule("matching", ["pawn"], ["white"], "test.matching"),
      scopedRule("wrong-piece", ["knight"], ["white"], "test.wrong-piece"),
      scopedRule("wrong-side", ["pawn"], ["black"], "test.wrong-side"),
    ]);

    engine.onEnterTile("pawn-a2", "a3");

    expect(executed).toEqual(["matching"]);
  });

  it("évalue le scope d’une promotion sur le type source", () => {
    const registry = new Registry();
    const promoted = vi.fn();
    registry.registerEffect("test.promoted", promoted);
    const contracts = createContracts();
    contracts.board.getPiece = (id: string) => ({
      id,
      type: "queen",
      side: "white",
      tile: "a8",
      statuses: {},
    });
    const rule = lifecycleRule([{ action: "test.promoted" }]);
    rule.scope = { affectedPieces: ["pawn"], sides: ["white"] };
    rule.logic!.effects![0].when = "lifecycle.onPromote";

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([rule]);
    engine.onPromote("pawn-a7", "pawn", "queen");

    expect(promoted).toHaveBeenCalledTimes(1);
  });

  it("applique le scope de camp aux lifecycle sans pièce source", () => {
    const registry = new Registry();
    const onTurn = vi.fn();
    registry.registerEffect("status.tickAll", () => true);
    registry.registerEffect("test.turn-start", onTurn);
    const rule = lifecycleRule([{ action: "test.turn-start" }]);
    rule.scope = { affectedPieces: ["knight"], sides: ["white"] };
    rule.logic!.effects![0].when = "lifecycle.onTurnStart";

    const engine = new RuleEngine(createContracts(), registry);
    engine.loadRules([rule]);
    engine.onTurnStart("white");
    engine.onTurnStart("black");

    expect(onTurn).toHaveBeenCalledTimes(1);
  });

  it("échoue fermé si la pièce source d’un lifecycle est introuvable", () => {
    const registry = new Registry();
    const executed = vi.fn();
    registry.registerEffect("test.must-not-run", executed);
    const contracts = createContracts();
    contracts.board.getPiece = () => {
      throw new Error("missing piece");
    };
    const rule = lifecycleRule([{ action: "test.must-not-run" }]);
    rule.scope = { affectedPieces: ["any"], sides: ["white", "black"] };

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([rule]);
    engine.onEnterTile("missing", "a3");

    expect(executed).not.toHaveBeenCalled();
  });

  it("décrémente les cooldowns une seule fois au début du tour", () => {
    const registry = new Registry();
    registry.registerEffect("status.tickAll", () => true);
    const contracts = createContracts();
    const engine = new RuleEngine(contracts, registry);

    engine.onTurnStart("white");

    expect(contracts.cooldown.tickAll).toHaveBeenCalledTimes(1);
  });

  it("retourne un échec lorsque la validation ou l’exécution UI échoue", () => {
    const registry = new Registry();
    registry.registerProvider("provider.allowed", () => ["a3"]);
    registry.registerEffect("test.success", () => true);
    registry.registerEffect("test.failure", () => false);
    const engine = new RuleEngine(createContracts(), registry);
    const actionRule = (
      ruleId: string,
      actionId: string,
      effect: string,
    ): RuleJSON => ({
      meta: { ruleId, ruleName: ruleId, isActive: true },
      scope: { affectedPieces: ["pawn"], sides: ["white"] },
      ui: {
        actions: [
          {
            id: actionId,
            label: actionId,
            availability: { requiresSelection: true, pieceTypes: ["pawn"] },
            targeting: {
              mode: "tile",
              validTilesProvider: "provider.allowed",
            },
          },
        ],
      },
      state: { namespace: `rules.${ruleId}`, initial: {} },
      logic: {
        effects: [
          {
            id: `${actionId}.step`,
            when: `ui.${actionId}`,
            do: { action: effect },
          },
        ],
      },
    });
    engine.loadRules([
      actionRule("success", "success.action", "test.success"),
      actionRule("failure", "failure.action", "test.failure"),
    ]);

    expect(engine.runUIAction("success.action", "pawn-a2", "h8")).toMatchObject(
      { ok: false },
    );
    expect(engine.runUIAction("failure.action", "pawn-a2", "a3")).toMatchObject(
      { ok: false },
    );
    expect(engine.runUIAction("success.action", "pawn-a2", "a3")).toEqual({
      ok: true,
    });
  });

  it("applique le camp du tour et ignore une pièce injectée pour une action globale", () => {
    const registry = new Registry();
    const contexts: EngineContext[] = [];
    registry.registerEffect("state.inc", (context) => {
      contexts.push(context);
      return true;
    });

    const contracts = createContracts();
    let turnSide: "white" | "black" = "black";
    contracts.match.get = () => ({ ply: 0, turnSide });
    contracts.board.getPiece = vi.fn(contracts.board.getPiece);
    contracts.cooldown.isReady = vi.fn(() => true);
    contracts.cooldown.set = vi.fn();

    const engine = new RuleEngine(contracts, registry);
    engine.loadRules([globalRuleArchitectRule(["white"])]);
    const actionId = engine.getUIActions()[0].id;

    expect(engine.runUIAction(actionId, "injected-black-piece")).toMatchObject({
      ok: false,
    });
    expect(contracts.board.getPiece).not.toHaveBeenCalled();

    turnSide = "white";
    expect(engine.runUIAction(actionId, "injected-black-piece")).toEqual({
      ok: true,
    });
    expect(contracts.board.getPiece).not.toHaveBeenCalled();
    expect(contracts.cooldown.isReady).not.toHaveBeenCalled();
    expect(contracts.cooldown.set).not.toHaveBeenCalled();
    expect(contexts).toHaveLength(1);
    expect(contexts[0]).toMatchObject({
      pieceId: undefined,
      piece: null,
      side: "white",
    });
  });

  it("refuse les scopes de camp Rule Architect invalides", () => {
    const invalidScopes: unknown[] = [
      undefined,
      [],
      ["red"],
      ["white", "white"],
    ];

    for (const sides of invalidScopes) {
      const registry = new Registry();
      registry.registerEffect("state.inc", () => true);
      const rule = globalRuleArchitectRule();

      if (sides === undefined) {
        delete rule.scope?.sides;
      } else {
        rule.scope!.sides = sides as Array<"white" | "black">;
      }

      const engine = new RuleEngine(createContracts(), registry);
      engine.loadRules([rule]);

      expect(engine.getRules()).toEqual([]);
      expect(engine.getUIActions()).toEqual([]);
    }
  });
});
