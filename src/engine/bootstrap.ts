import { RuleEngine, type RuleEngineOptions } from "./engine";
import { Registry } from "./registry";
import { registerBuiltinConditions } from "./builtins/conditions";
import { registerBuiltinEffects } from "./builtins/effects";
import { registerBuiltinProviders } from "./builtins/providers";
import type { EngineContracts, RuleJSON } from "./types";

export function createRuleEngine(
  engineContracts: EngineContracts,
  rules: RuleJSON[],
  options: RuleEngineOptions = {},
) {
  const registry = new Registry();

  registerBuiltinConditions(registry);
  registerBuiltinEffects(registry);
  registerBuiltinProviders(registry);

  let validRules = rules;
  if (import.meta.env.VITE_ENABLE_LEGACY_RULES !== "true") {
    validRules = rules.filter(
      (rule) =>
        Array.isArray(rule.logic?.effects) && rule.logic.effects.length > 0,
    );

    console.log(
      `[engine] Legacy mode disabled, ${validRules.length}/${rules.length} rules loaded`,
    );
  }

  if (import.meta.env.VITE_DEBUG_RULE_ENGINE === "true") {
    console.group("[RuleEngine Debug]");
    console.log("Rules to load:", rules.length);
    console.log("Valid rules after filter:", validRules.length);
    console.log(
      "Rule IDs:",
      validRules.map((rule) => rule.meta.ruleId),
    );
    console.log("Runtime options:", {
      matchSeedConfigured: options.matchSeed !== undefined,
      maxEffectsPerRuleEvent: options.maxEffectsPerRuleEvent,
      maxNestedDepth: options.maxNestedDepth,
    });
    console.groupEnd();
  }

  const ruleEngine = new RuleEngine(engineContracts, registry, options);
  ruleEngine.loadRules(validRules);

  engineContracts.eventBus.on("lifecycle.onEnterTile", (payload) =>
    ruleEngine.onEnterTile(payload.pieceId, payload.to),
  );
  engineContracts.eventBus.on("lifecycle.onMoveCommitted", (payload) =>
    ruleEngine.onMoveCommitted(payload),
  );
  engineContracts.eventBus.on("lifecycle.onUndo", () => ruleEngine.onUndo());
  engineContracts.eventBus.on("lifecycle.onPromote", (payload) =>
    ruleEngine.onPromote(payload.pieceId, payload.fromType, payload.toType),
  );
  engineContracts.eventBus.on("lifecycle.onTurnStart", (payload) =>
    ruleEngine.onTurnStart(payload.side),
  );
  engineContracts.eventBus.on("ui.runAction", (payload) =>
    ruleEngine.runUIAction(
      payload.actionId,
      payload.pieceId,
      payload.targetTile,
    ),
  );

  return ruleEngine;
}

export { Registry } from "./registry";
export * from "./types";
export { RuleEngine, type RuleEngineOptions } from "./engine";
export { EventBus } from "./eventBus";
export { Cooldown } from "./cooldown";
export { StateStore } from "./stateStore";
