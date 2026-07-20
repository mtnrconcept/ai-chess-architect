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
    },
    ui: {
      registerAction: vi.fn(),
      unregisterAction: vi.fn(),
      toast: vi.fn(),
    },
    vfx: {},
    match: {
      endTurn: vi.fn(),
      get: () => ({ ply: 0 }),
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
});
