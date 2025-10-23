/**
 * Validation AJV avec JSON Schema pour RuleJSON
 */
import Ajv from "https://esm.sh/ajv@8.12.0";

// JSON Schema pour RuleJSON v1
const ruleJsonSchema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://ai-chess-architect.lovable.app/schemas/RuleJSON.v1.json",
  "type": "object",
  "required": ["meta", "logic"],
  "properties": {
    "meta": {
      "type": "object",
      "required": ["ruleId", "ruleName", "description"],
      "properties": {
        "ruleId": { "type": "string", "pattern": "^[a-z0-9_-]{3,50}$" },
        "ruleName": { "type": "string", "minLength": 1, "maxLength": 100 },
        "version": { "type": "string", "pattern": "^\\d+\\.\\d+\\.\\d+$" },
        "description": { "type": "string", "minLength": 5, "maxLength": 500 },
        "category": { "type": "string" },
        "isActive": { "type": "boolean" },
        "tags": { "type": "array", "items": { "type": "string" } }
      }
    },
    "scope": {
      "type": "object",
      "properties": {
        "affectedPieces": { 
          "type": "array", 
          "items": { "type": "string" }
        },
        "sides": { 
          "type": "array", 
          "items": { "enum": ["white", "black"] }
        }
      }
    },
    "ui": {
      "type": "object",
      "properties": {
        "actions": {
          "type": "array",
          "items": { "$ref": "#/definitions/UIAction" }
        }
      }
    },
    "logic": {
      "type": "object",
      "required": ["effects"],
      "properties": {
        "effects": {
          "type": "array",
          "minItems": 1,
          "items": { "$ref": "#/definitions/LogicStep" }
        }
      }
    },
    "state": {
      "type": "object",
      "properties": {
        "namespace": { "type": "string" },
        "initial": { "type": "object" }
      }
    }
  },
  "definitions": {
    "UIAction": {
      "type": "object",
      "required": ["id", "label"],
      "properties": {
        "id": { "type": "string", "pattern": "^special_.*" },
        "label": { "type": "string" },
        "icon": { "type": "string" },
        "hint": { "type": "string" },
        "availability": { "type": "object" },
        "targeting": { "type": "object" },
        "consumesTurn": { "type": "boolean" },
        "cooldown": { "type": "object" }
      }
    },
    "LogicStep": {
      "type": "object",
      "required": ["id", "when", "do"],
      "properties": {
        "id": { "type": "string" },
        "when": { "type": "string", "pattern": "^(ui\\.|lifecycle\\.|status\\.).*" },
        "if": { "oneOf": [{ "type": "string" }, { "type": "array" }] },
        "do": { 
          "oneOf": [
            { "$ref": "#/definitions/ActionStep" }, 
            { "type": "array", "items": { "$ref": "#/definitions/ActionStep" } }
          ]
        },
        "onFail": {
          "oneOf": [
            { "$ref": "#/definitions/ActionStep" }, 
            { "type": "array", "items": { "$ref": "#/definitions/ActionStep" } }
          ]
        }
      }
    },
    "ActionStep": {
      "type": "object",
      "required": ["action"],
      "properties": {
        "action": { "type": "string", "pattern": "^[a-z]+\\.[a-z]+" },
        "params": { "type": "object" }
      }
    }
  }
};

const ajv = new Ajv({ allErrors: true, strict: true, verbose: true });
const validateSchema = ajv.compile(ruleJsonSchema);

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  warnings?: string[];
}

const KNOWN_ACTIONS = new Set([
  "tile.setTrap", "tile.clearTrap", "tile.resolveTrap",
  "piece.spawn", "piece.capture", "piece.move", "piece.duplicate", "piece.setInvisible", "piece.teleport", "piece.swap", "piece.morph",
  "status.add", "status.remove", "status.tickAll", "status.apply",
  "vfx.play", "audio.play", 
  "ui.toast",
  "cooldown.set", 
  "turn.end", 
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
      errors: validateSchema.errors?.map(e => `${e.instancePath || e.keyword}: ${e.message}`) || []
    };
  }

  // Validation métier supplémentaire
  const ruleJSON = rule as any;
  const warnings: string[] = [];

  ruleJSON.logic?.effects?.forEach((effect: any) => {
    const actions = Array.isArray(effect.do) ? effect.do : [effect.do];
    actions.forEach((action: any) => {
      if (!KNOWN_ACTIONS.has(action.action)) {
        warnings.push(`Action inconnue: ${action.action} (effet: ${effect.id})`);
      }
    });
  });

  return { valid: true, warnings: warnings.length > 0 ? warnings : undefined };
}
