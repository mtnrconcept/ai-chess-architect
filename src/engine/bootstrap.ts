import { RuleEngine } from "./engine";
import { Registry } from "./registry";
import { registerBuiltinConditions } from "./builtins/conditions";
import { registerBuiltinEffects } from "./builtins/effects";
import { registerBuiltinProviders } from "./builtins/providers";
import { EngineContracts, RuleJSON } from "./types";

export function createRuleEngine(engineContracts: EngineContracts, rules: RuleJSON[]) {
  const registry = new Registry();

  registerBuiltinConditions(registry);
  registerBuiltinEffects(registry);
  registerBuiltinProviders(registry);

  const ruleEngine = new RuleEngine(engineContracts, registry);
  ruleEngine.loadRules(rules);

  engineContracts.eventBus.on("lifecycle.onEnterTile", (p) =>
    ruleEngine.onEnterTile(p.pieceId, p.to)
  );

  engineContracts.eventBus.on("lifecycle.onMoveCommitted", (p) =>
    ruleEngine.onMoveCommitted(p)
  );

  engineContracts.eventBus.on("lifecycle.onUndo", () =>
    ruleEngine.onUndo()
  );

  engineContracts.eventBus.on("lifecycle.onPromote", (p) =>
    ruleEngine.onPromote(p.pieceId, p.fromType, p.toType)
  );

  engineContracts.eventBus.on("lifecycle.onTurnStart", (p) =>
    ruleEngine.onTurnStart(p.side)
  );

  engineContracts.eventBus.on("ui.runAction", (p) =>
    ruleEngine.runUIAction(p.actionId, p.pieceId, p.targetTile)
  );

  return ruleEngine;
}

export { Registry } from "./registry";
export * from "./types";
export { RuleEngine } from "./engine";
export { EventBus } from "./eventBus";
export { Cooldown } from "./cooldown";
export { StateStore } from "./stateStore";
