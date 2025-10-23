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
  "tile.setTrap", "tile.clearTrap", "tile.resolveTrap",
  "piece.spawn", "piece.capture", "piece.move", "piece.duplicate", "piece.setInvisible", "piece.teleport", "piece.swap", "piece.morph",
  "status.add", "status.remove", "status.tickAll", "status.apply",
  "vfx.play", "audio.play", "ui.toast",
  "cooldown.set", "turn.end", 
  "state.set", "state.inc", "state.delete", "state.pushUndo",
  "board.capture", "board.areaEffect",
  "vfx.spawnDecal", "vfx.clearDecal", "vfx.playAnimation", "vfx.playAudio",
  "decal.set", "decal.clear",
  "area.forEachTile", "composite",
  "intent.cancel",
  "hazard.spawn", "hazard.clear", "hazard.resolve",
  "projectile.spawn"
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
