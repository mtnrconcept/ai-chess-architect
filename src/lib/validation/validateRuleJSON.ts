import Ajv from "ajv";
import schema from "./ruleJsonSchema.json";
import { RuleJSON } from "@/engine/types";

const ajv = new Ajv({ allErrors: true, verbose: true });
const validateSchema = ajv.compile(schema);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

const KNOWN_ACTIONS = new Set([
  "tile.setTrap", "tile.clearTrap", "piece.spawn", "piece.capture",
  "status.add", "status.remove", "vfx.play", "audio.play", "ui.toast",
  "cooldown.set", "turn.end", "state.set", "state.inc", "board.capture",
  "vfx.spawnDecal", "vfx.clearDecal", "vfx.playAnimation", "vfx.playAudio"
]);

export function validateRuleJSON(rule: unknown): ValidationResult {
  const valid = validateSchema(rule);
  
  if (!valid) {
    return {
      valid: false,
      errors: validateSchema.errors?.map(e => `${e.keyword || 'validation'}: ${e.message}`) || []
    };
  }

  // Validation métier supplémentaire
  const ruleJSON = rule as RuleJSON;
  const warnings: string[] = [];

  ruleJSON.logic?.effects?.forEach(effect => {
    const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
    actions.forEach(action => {
      if (!KNOWN_ACTIONS.has(action.action)) {
        warnings.push(`Action inconnue: ${action.action} (effet: ${effect.id})`);
      }
    });
  });

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}
