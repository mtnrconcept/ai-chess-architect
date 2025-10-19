import { EngineContracts, RuleJSON, LogicStep, ActionStep, UIActionSpec, PieceID, Tile } from "./types";
import { Registry } from "./registry";

export class RuleEngine {
  constructor(
    private engine: EngineContracts,
    private registry: Registry
  ) {}

  private rules: RuleJSON[] = [];
  private handlers = new Map<string, string[]>();
  private uiActions: UIActionSpec[] = [];

  loadRules(rules: RuleJSON[]) {
    this.rules = rules.filter(r => r.meta?.isActive !== false);

    for (const rule of this.rules) {
      if (rule.ui?.actions) {
        rule.ui.actions.forEach(a => {
          this.engine.ui.registerAction(a);
          this.uiActions.push(a);
        });
      }

      Object.entries(rule.handlers ?? {}).forEach(([evt, id]) => {
        if (!this.handlers.has(evt)) this.handlers.set(evt, []);
        this.handlers.get(evt)!.push(id);
      });
    }
  }

  private evaluateLogicBlock(eventId: string, context: any, steps?: LogicStep[]) {
    if (!steps) return;

    for (const step of steps) {
      if (step.when !== eventId && step.when !== "always") continue;

      const conds = Array.isArray(step.if) ? step.if : step.if ? [step.if] : [];
      const pass = conds.every(c => this.registry.runCondition(c, context));

      if (!pass) {
        if (step.onFail === "blockAction") {
          if (step.message) this.engine.ui.toast(step.message);
          return;
        }
        continue;
      }

      const actions = Array.isArray(step.do) ? step.do : [step.do];
      for (const a of actions) {
        this.registry.runEffect(a, context);
      }
    }
  }

  onEnterTile(pieceId: PieceID, to: Tile) {
    const ctx = this.buildContext({ pieceId, to, event: "lifecycle.onEnterTile" });
    for (const rule of this.rules) {
      this.evaluateLogicBlock("lifecycle.onEnterTile", ctx.withRule(rule), rule.logic?.effects);
    }
  }

  onMoveCommitted(move: { pieceId: PieceID; from: Tile; to: Tile }) {
    const ctx = this.buildContext({ ...move, event: "lifecycle.onMoveCommitted" });
    for (const rule of this.rules) {
      this.evaluateLogicBlock("lifecycle.onMoveCommitted", ctx.withRule(rule), rule.logic?.effects);
    }
  }

  onUndo() {
    const ctx = this.buildContext({ event: "lifecycle.onUndo" });
    for (const rule of this.rules) {
      this.evaluateLogicBlock("lifecycle.onUndo", ctx.withRule(rule), rule.logic?.effects);
    }
  }

  onPromote(pieceId: PieceID, fromType: string, toType: string) {
    const ctx = this.buildContext({ event: "lifecycle.onPromote", pieceId, fromType, toType });
    for (const rule of this.rules) {
      this.evaluateLogicBlock("lifecycle.onPromote", ctx.withRule(rule), rule.logic?.effects);
    }
  }

  // Phase 1: Gestion du début de tour pour tick des statuts
  onTurnStart(side: string) {
    const ctx = this.buildContext({ event: "lifecycle.onTurnStart", side });
    
    // Tick des statuts AVANT d'évaluer les règles
    this.registry.runEffect({ action: "status.tickAll", params: { side } }, ctx);
    
    for (const rule of this.rules) {
      this.evaluateLogicBlock("lifecycle.onTurnStart", ctx.withRule(rule), rule.logic?.effects);
    }
  }

  runUIAction(actionId: string, pieceId?: PieceID, targetTile?: Tile) {
    const action = this.uiActions.find(a => a.id === actionId);
    if (!action) {
      this.engine.ui.toast(`Action inconnue: ${actionId}`);
      return;
    }

    // Phase 2: Enrichir avec targetPieceId si une pièce est sur targetTile
    let targetPieceId: PieceID | undefined;
    if (targetTile) {
      targetPieceId = this.engine.board.getPieceAt(targetTile) ?? undefined;
    }

    const ctx = this.buildContext({ 
      event: `ui.${actionId}`, 
      pieceId, 
      targetTile,
      targetPieceId,
      baseActionId: actionId
    });
    
    for (const rule of this.rules) {
      this.evaluateLogicBlock(`ui.${actionId}`, ctx.withRule(rule), rule.logic?.effects);
    }
  }

  private buildContext(base: Record<string, any>) {
    const engine = this.engine;
    const registry = this.registry;

    return {
      ...base,
      engine,
      registry,
      state: {}, // State global par défaut
      get piece() {
        return base.pieceId ? engine.board.getPiece(base.pieceId) : null;
      },
      withRule(rule: RuleJSON) {
        const ruleState = rule.state?.namespace
          ? engine.state.getOrInit(rule.state.namespace, rule.state.initial ?? {})
          : {};

        return {
          ...this,
          rule,
          params: rule.parameters ?? {},
          state: ruleState
        };
      }
    };
  }

  getRules() {
    return this.rules;
  }

  getUIActions() {
    return this.uiActions;
  }
}
