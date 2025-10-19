import { describe, it, expect } from "vitest";
import { convertChessRuleToRuleJSON } from "./chessRuleToRuleJsonConverter";
import { ChessRule } from "@/types/chess";
import { Registry } from "@/engine/registry";
import { RuleEngine } from "@/engine/engine";
import { registerBuiltinEffects } from "@/engine/builtins/effects";
import type {
  EngineContracts,
  ActionStep,
  LogicStep,
  UIActionSpec,
  Piece,
} from "@/engine/types";

function getActionSteps(step?: LogicStep) {
  if (!step) return [];
  return (Array.isArray(step.do) ? step.do : [step.do]) as ActionStep[];
}

describe("ChessRule → RuleJSON Converter", () => {
  it("devrait convertir une règle avec deployBomb", () => {
    const chessRule: ChessRule = {
      ruleId: "test_bomb",
      ruleName: "Test Bomb",
      description: "Test deployment",
      category: "special",
      affectedPieces: ["pawn"],
      trigger: "conditional",
      conditions: [],
      effects: [
        {
          action: "deployBomb",
          target: "self",
          parameters: { radius: 1, countdown: 3 },
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

    const result = convertChessRuleToRuleJSON(chessRule);

    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(1);
    expect(result.rule?.ui?.actions?.[0].id).toBe("special_deployBomb_0");
    expect(result.rule?.ui?.actions?.[0].icon).toBe("💣");
  });

  it("devrait convertir une règle avec addAbility", () => {
    const chessRule: ChessRule = {
      ruleId: "test_ability",
      ruleName: "Test Ability",
      description: "Test ability",
      category: "special",
      affectedPieces: ["knight"],
      trigger: "conditional",
      conditions: [],
      effects: [
        {
          action: "addAbility",
          target: "self",
          parameters: { ability: "fly", countdown: 2 },
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

    const result = convertChessRuleToRuleJSON(chessRule);

    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(1);
    expect(result.rule?.ui?.actions?.[0].label).toBe("Activer pouvoir");

    const logic = (result.rule?.logic?.effects ?? []) as LogicStep[];
    const abilityEffect = logic.find(
      (step) => step.when === "ui.special_addAbility_0",
    );
    const actions = getActionSteps(abilityEffect);
    expect(actions[0]).toMatchObject({
      action: "status.add",
      params: {
        key: "fly",
        metadata: { ability: "fly" },
      },
    });
  });

  it("devrait signaler les effets non mappables", () => {
    const chessRule: ChessRule = {
      ruleId: "test_unknown",
      ruleName: "Test Unknown",
      description: "Test unknown effect",
      category: "special",
      affectedPieces: ["pawn"],
      trigger: "conditional",
      conditions: [],
      effects: [
        {
          action: "unknownAction",
          target: "self",
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

    const result = convertChessRuleToRuleJSON(chessRule);

    expect(result.success).toBe(false);
    expect(result.unmappedEffects).toContain("unknownAction");
    expect(result.ambiguities.length).toBeGreaterThan(0);
  });

  it("devrait créer des effets passifs pour les actions non-UI", () => {
    const chessRule: ChessRule = {
      ruleId: "test_passive",
      ruleName: "Test Passive",
      description: "Test passive effect",
      category: "movement",
      affectedPieces: ["knight"],
      trigger: "onMove",
      conditions: [],
      effects: [
        {
          action: "extraMove",
          target: "self",
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

    const result = convertChessRuleToRuleJSON(chessRule);

    expect(result.success).toBe(true);
    expect(result.rule?.ui?.actions).toHaveLength(0);
    expect(result.rule?.logic?.effects).toHaveLength(1);
    expect(result.rule?.logic?.effects?.[0].when).toBe(
      "lifecycle.onMoveCommitted",
    );
  });
});

describe("Converted rules runtime integration", () => {
  function createTestEngine() {
    const pieces = new Map<string, Piece>();
    const uiActions: UIActionSpec[] = [];
    const stateStore = {
      root: {} as Record<string, unknown>,
      getOrInit(namespace: string, initial: unknown) {
        if (!this.root[namespace]) {
          const clone: unknown = initial
            ? JSON.parse(JSON.stringify(initial))
            : {};
          this.root[namespace] = clone;
        }
        return this.root[namespace];
      },
      serialize() {
        return JSON.stringify(this.root);
      },
      deserialize(payload: string) {
        this.root = payload ? JSON.parse(payload) : {};
      },
      pushUndo() {},
      undo() {},
    };

    const matchState = { ply: 0, turnSide: "white" as const };

    const engineContracts: EngineContracts = {
      board: {
        tiles: () => [],
        isEmpty: () => true,
        getPieceAt: () => null,
        getPiece: (id: string) => {
          const piece = pieces.get(id);
          if (!piece) throw new Error(`Missing piece ${id}`);
          return piece;
        },
        setPieceTile: () => {},
        removePiece: () => {},
        spawnPiece: () => "spawned",
        withinBoard: () => true,
        neighbors: () => [],
        setDecal: () => {},
        clearDecal: () => {},
      },
      ui: {
        toast: () => {},
        registerAction: (action) => {
          uiActions.push(action);
        },
      },
      vfx: {
        spawnDecal: () => {},
        clearDecal: () => {},
        playAnimation: () => {},
        playAudio: () => {},
      },
      cooldown: {
        set: () => {},
        isReady: () => true,
        tickAll: () => {},
        serialize: () => "{}",
        deserialize: () => {},
      },
      state: stateStore,
      match: {
        get: () => ({ ply: matchState.ply, turnSide: matchState.turnSide }),
        setTurn: (side) => {
          matchState.turnSide = side;
        },
        endTurn: () => {
          matchState.ply += 1;
        },
      },
      util: {
        uuid: () => "uuid",
      },
      capturePiece: () => {},
      eventBus: {
        emit: () => {},
        on: () => {},
      },
    };

    return { engineContracts, pieces, uiActions, stateStore };
  }

  it("applies statuses and mutates rule state when executing converted ability", () => {
    const chessRule: ChessRule = {
      ruleId: "runtime_ability",
      ruleName: "Runtime Ability",
      description: "Adds a flying ability and marks movement state.",
      category: "special",
      affectedPieces: ["knight"],
      trigger: "always",
      conditions: [],
      effects: [
        {
          action: "addAbility",
          target: "self",
          parameters: {
            ability: "windStep",
            countdown: 2,
            metadata: { icon: "🌀" },
          },
        },
        {
          action: "modifyMovement",
          target: "self",
          parameters: { ability: "windStep" },
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
    const rule = conversion.rule!;

    const { engineContracts, pieces, uiActions, stateStore } =
      createTestEngine();
    const registry = new Registry();
    registerBuiltinEffects(registry);
    const ruleEngine = new RuleEngine(engineContracts, registry);

    const pieceId = "piece-1";
    pieces.set(pieceId, {
      id: pieceId,
      type: "knight",
      side: "white",
      tile: "b1",
      statuses: {},
    });

    ruleEngine.loadRules([rule]);
    expect(uiActions.map((a) => a.id)).toContain("special_addAbility_0");

    ruleEngine.runUIAction("special_addAbility_0", pieceId);

    const piece = pieces.get(pieceId);
    expect(piece?.statuses?.windStep).toMatchObject({
      active: true,
      metadata: { icon: "🌀", ability: "windStep" },
    });

    ruleEngine.onTurnStart("white");
    const ruleState = stateStore.root[`rules.${chessRule.ruleId}`] as
      | Record<string, unknown>
      | undefined;
    const movementState = ruleState?.movement as
      | Record<string, unknown>
      | undefined;
    expect(movementState?.windStep).toBe(true);
  });
});
