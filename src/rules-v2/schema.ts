import {
  ARGUMENT_KINDS,
  CONDITION_OPS,
  EFFECT_OPS,
  PIECE_TYPES,
  PROVIDERS,
  RULE_CATEGORIES,
  RULE_EVENTS,
  RULE_SCHEMA_VERSION,
  SIDES,
  TARGETING_MODES,
  type RuleBlueprintV2,
  type RuleDiagnostic,
} from "./types";

const argumentSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "kind",
    "stringValue",
    "numberValue",
    "booleanValue",
    "stringListValue",
  ],
  properties: {
    name: { type: "string", minLength: 1, maxLength: 50 },
    kind: { type: "string", enum: [...ARGUMENT_KINDS] },
    stringValue: { type: "string", maxLength: 500 },
    numberValue: { type: "number", minimum: -100000, maximum: 100000 },
    booleanValue: { type: "boolean" },
    stringListValue: {
      type: "array",
      maxItems: 32,
      items: { type: "string", maxLength: 100 },
    },
  },
} as const;

export const RULE_BLUEPRINT_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "schemaVersion",
    "ruleKey",
    "title",
    "summary",
    "category",
    "tags",
    "affectedPieces",
    "sides",
    "stateNamespace",
    "initialStateJson",
    "actions",
    "triggers",
    "balance",
    "explanation",
  ],
  properties: {
    schemaVersion: { type: "string", const: RULE_SCHEMA_VERSION },
    ruleKey: {
      type: "string",
      pattern: "^[a-z][a-z0-9-]{2,49}$",
    },
    title: { type: "string", minLength: 3, maxLength: 100 },
    summary: { type: "string", minLength: 10, maxLength: 600 },
    category: { type: "string", enum: [...RULE_CATEGORIES] },
    tags: {
      type: "array",
      maxItems: 12,
      items: { type: "string", minLength: 1, maxLength: 40 },
    },
    affectedPieces: {
      type: "array",
      minItems: 1,
      maxItems: 7,
      items: { type: "string", enum: [...PIECE_TYPES] },
    },
    sides: {
      type: "array",
      minItems: 1,
      maxItems: 2,
      items: { type: "string", enum: [...SIDES] },
    },
    stateNamespace: {
      type: "string",
      pattern: "^[a-z][a-z0-9_.-]{2,79}$",
    },
    initialStateJson: {
      type: "string",
      minLength: 2,
      maxLength: 8000,
    },
    actions: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "label",
          "description",
          "targetingMode",
          "validTilesProvider",
          "consumesTurn",
          "cooldownTurns",
          "maxPerPiece",
          "requiresSelection",
          "pieceTypes",
        ],
        properties: {
          id: {
            type: "string",
            pattern: "^[a-z][a-z0-9-]{1,39}$",
          },
          label: { type: "string", minLength: 1, maxLength: 60 },
          description: { type: "string", minLength: 3, maxLength: 240 },
          targetingMode: {
            type: "string",
            enum: [...TARGETING_MODES],
          },
          validTilesProvider: {
            type: "string",
            enum: [...PROVIDERS],
          },
          consumesTurn: { type: "boolean" },
          cooldownTurns: {
            type: "integer",
            minimum: 0,
            maximum: 20,
          },
          maxPerPiece: {
            type: "integer",
            minimum: 0,
            maximum: 50,
          },
          requiresSelection: { type: "boolean" },
          pieceTypes: {
            type: "array",
            minItems: 1,
            maxItems: 7,
            items: { type: "string", enum: [...PIECE_TYPES] },
          },
        },
      },
    },
    triggers: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "id",
          "event",
          "actionId",
          "priority",
          "conditions",
          "effects",
          "onFailure",
          "message",
        ],
        properties: {
          id: {
            type: "string",
            pattern: "^[a-z][a-z0-9-]{1,49}$",
          },
          event: { type: "string", enum: [...RULE_EVENTS] },
          actionId: { type: "string", maxLength: 40 },
          priority: {
            type: "integer",
            minimum: -100,
            maximum: 100,
          },
          conditions: {
            type: "array",
            maxItems: 12,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "op", "arguments", "negate"],
              properties: {
                id: {
                  type: "string",
                  pattern: "^[a-z][a-z0-9-]{1,49}$",
                },
                op: { type: "string", enum: [...CONDITION_OPS] },
                arguments: {
                  type: "array",
                  maxItems: 12,
                  items: argumentSchema,
                },
                negate: { type: "boolean" },
              },
            },
          },
          effects: {
            type: "array",
            minItems: 1,
            maxItems: 16,
            items: {
              type: "object",
              additionalProperties: false,
              required: ["id", "op", "arguments"],
              properties: {
                id: {
                  type: "string",
                  pattern: "^[a-z][a-z0-9-]{1,49}$",
                },
                op: { type: "string", enum: [...EFFECT_OPS] },
                arguments: {
                  type: "array",
                  maxItems: 12,
                  items: argumentSchema,
                },
              },
            },
          },
          onFailure: {
            type: "string",
            enum: ["blockAction", "skip"],
          },
          message: { type: "string", maxLength: 240 },
        },
      },
    },
    balance: {
      type: "object",
      additionalProperties: false,
      required: ["powerLevel", "counterplay", "limitations"],
      properties: {
        powerLevel: {
          type: "integer",
          minimum: 1,
          maximum: 5,
        },
        counterplay: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 3, maxLength: 240 },
        },
        limitations: {
          type: "array",
          minItems: 1,
          maxItems: 8,
          items: { type: "string", minLength: 3, maxLength: 240 },
        },
      },
    },
    explanation: {
      type: "object",
      additionalProperties: false,
      required: ["plainLanguage", "examples"],
      properties: {
        plainLanguage: {
          type: "string",
          minLength: 20,
          maxLength: 1200,
        },
        examples: {
          type: "array",
          minItems: 1,
          maxItems: 6,
          items: { type: "string", minLength: 5, maxLength: 400 },
        },
      },
    },
  },
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasOnlyKeys = (
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean => Object.keys(value).every((key) => allowed.includes(key));

const hasUniqueStrings = (values: unknown[]): boolean => {
  const strings = values.filter(
    (value): value is string => typeof value === "string",
  );
  return (
    strings.length === values.length && new Set(strings).size === strings.length
  );
};

const push = (
  diagnostics: RuleDiagnostic[],
  code: string,
  path: string,
  message: string,
) => diagnostics.push({ code, severity: "error", path, message });

const FORBIDDEN_STATE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function validateInitialStateValue(
  value: unknown,
  diagnostics: RuleDiagnostic[],
  path = "$.initialStateJson",
  depth = 0,
  budget = { nodes: 0 },
): void {
  budget.nodes += 1;

  if (budget.nodes > 256) {
    push(
      diagnostics,
      "BLUEPRINT_INITIAL_STATE_SIZE",
      path,
      "L'état initial dépasse 256 valeurs.",
    );
    return;
  }

  if (depth > 8) {
    push(
      diagnostics,
      "BLUEPRINT_INITIAL_STATE_DEPTH",
      path,
      "L'état initial dépasse 8 niveaux d'imbrication.",
    );
    return;
  }

  if (value === null || typeof value === "boolean") {
    return;
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      push(
        diagnostics,
        "BLUEPRINT_INITIAL_STATE_NUMBER",
        path,
        "L'état initial contient un nombre non fini.",
      );
    }
    return;
  }

  if (typeof value === "string") {
    if (value.length > 1000) {
      push(
        diagnostics,
        "BLUEPRINT_INITIAL_STATE_STRING",
        path,
        "Une valeur texte de l'état initial dépasse 1000 caractères.",
      );
    }
    return;
  }

  if (Array.isArray(value)) {
    if (value.length > 64) {
      push(
        diagnostics,
        "BLUEPRINT_INITIAL_STATE_ARRAY",
        path,
        "Un tableau de l'état initial dépasse 64 éléments.",
      );
      return;
    }

    value.forEach((item, index) =>
      validateInitialStateValue(
        item,
        diagnostics,
        `${path}[${index}]`,
        depth + 1,
        budget,
      ),
    );
    return;
  }

  if (isRecord(value)) {
    const entries = Object.entries(value);
    if (entries.length > 64) {
      push(
        diagnostics,
        "BLUEPRINT_INITIAL_STATE_OBJECT_SIZE",
        path,
        "Un objet de l'état initial dépasse 64 propriétés.",
      );
      return;
    }

    for (const [key, item] of entries) {
      if (FORBIDDEN_STATE_KEYS.has(key)) {
        push(
          diagnostics,
          "BLUEPRINT_INITIAL_STATE_KEY",
          `${path}.${key}`,
          `La clé ${key} est interdite.`,
        );
        continue;
      }

      if (!/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(key)) {
        push(
          diagnostics,
          "BLUEPRINT_INITIAL_STATE_KEY_FORMAT",
          `${path}.${key}`,
          "Les clés d'état doivent être des identifiants simples.",
        );
        continue;
      }

      validateInitialStateValue(
        item,
        diagnostics,
        `${path}.${key}`,
        depth + 1,
        budget,
      );
    }
    return;
  }

  push(
    diagnostics,
    "BLUEPRINT_INITIAL_STATE_VALUE",
    path,
    "L'état initial contient une valeur non autorisée.",
  );
}

export function validateBlueprintShape(input: unknown): {
  value: RuleBlueprintV2 | null;
  diagnostics: RuleDiagnostic[];
} {
  const diagnostics: RuleDiagnostic[] = [];
  if (!isRecord(input)) {
    push(
      diagnostics,
      "BLUEPRINT_NOT_OBJECT",
      "$",
      "Le blueprint doit être un objet.",
    );
    return { value: null, diagnostics };
  }

  const rootKeys = [
    "schemaVersion",
    "ruleKey",
    "title",
    "summary",
    "category",
    "tags",
    "affectedPieces",
    "sides",
    "stateNamespace",
    "initialStateJson",
    "actions",
    "triggers",
    "balance",
    "explanation",
  ] as const;

  if (!hasOnlyKeys(input, rootKeys)) {
    push(
      diagnostics,
      "BLUEPRINT_UNKNOWN_FIELD",
      "$",
      "Le blueprint contient un champ non autorisé.",
    );
  }

  if (input.schemaVersion !== RULE_SCHEMA_VERSION) {
    push(
      diagnostics,
      "BLUEPRINT_SCHEMA_VERSION",
      "$.schemaVersion",
      `schemaVersion doit valoir ${RULE_SCHEMA_VERSION}.`,
    );
  }

  const ruleKey = input.ruleKey;
  if (typeof ruleKey !== "string" || !/^[a-z][a-z0-9-]{2,49}$/.test(ruleKey)) {
    push(
      diagnostics,
      "BLUEPRINT_RULE_KEY",
      "$.ruleKey",
      "ruleKey doit être un slug de 3 à 50 caractères.",
    );
  }

  if (
    typeof input.title !== "string" ||
    input.title.length < 3 ||
    input.title.length > 100
  ) {
    push(diagnostics, "BLUEPRINT_TITLE", "$.title", "Titre invalide.");
  }

  if (
    typeof input.summary !== "string" ||
    input.summary.length < 10 ||
    input.summary.length > 600
  ) {
    push(diagnostics, "BLUEPRINT_SUMMARY", "$.summary", "Résumé invalide.");
  }

  if (
    typeof input.category !== "string" ||
    !RULE_CATEGORIES.includes(input.category as never)
  ) {
    push(
      diagnostics,
      "BLUEPRINT_CATEGORY",
      "$.category",
      "Catégorie invalide.",
    );
  }

  const stringArray = (
    key: "tags" | "affectedPieces" | "sides",
    allowed?: readonly string[],
    min = 0,
    max = 12,
  ) => {
    const value = input[key];
    if (
      !Array.isArray(value) ||
      value.length < min ||
      value.length > max ||
      !hasUniqueStrings(value) ||
      (allowed &&
        value.some(
          (item) => typeof item !== "string" || !allowed.includes(item),
        ))
    ) {
      push(
        diagnostics,
        `BLUEPRINT_${key.toUpperCase()}`,
        `$.${key}`,
        `${key} est invalide ou contient des doublons.`,
      );
    }
  };

  stringArray("tags", undefined, 0, 12);
  stringArray("affectedPieces", PIECE_TYPES, 1, 7);
  stringArray("sides", SIDES, 1, 2);

  if (
    typeof input.stateNamespace !== "string" ||
    !/^[a-z][a-z0-9_.-]{2,79}$/.test(input.stateNamespace)
  ) {
    push(
      diagnostics,
      "BLUEPRINT_STATE_NAMESPACE",
      "$.stateNamespace",
      "Namespace d'état invalide.",
    );
  }

  if (
    typeof input.initialStateJson !== "string" ||
    input.initialStateJson.length < 2 ||
    input.initialStateJson.length > 8000
  ) {
    push(
      diagnostics,
      "BLUEPRINT_INITIAL_STATE",
      "$.initialStateJson",
      "État initial JSON invalide.",
    );
  } else {
    try {
      const state = JSON.parse(input.initialStateJson);
      if (!isRecord(state)) {
        push(
          diagnostics,
          "BLUEPRINT_INITIAL_STATE_OBJECT",
          "$.initialStateJson",
          "L'état initial doit être un objet JSON.",
        );
      } else {
        validateInitialStateValue(state, diagnostics);
      }
    } catch {
      push(
        diagnostics,
        "BLUEPRINT_INITIAL_STATE_PARSE",
        "$.initialStateJson",
        "L'état initial n'est pas un JSON valide.",
      );
    }
  }

  if (!Array.isArray(input.actions) || input.actions.length > 6) {
    push(
      diagnostics,
      "BLUEPRINT_ACTIONS",
      "$.actions",
      "actions doit contenir au maximum 6 éléments.",
    );
  } else {
    const ids = new Set<string>();
    input.actions.forEach((raw, index) => {
      const path = `$.actions[${index}]`;
      if (!isRecord(raw)) {
        push(diagnostics, "BLUEPRINT_ACTION_OBJECT", path, "Action invalide.");
        return;
      }
      const allowed = [
        "id",
        "label",
        "description",
        "targetingMode",
        "validTilesProvider",
        "consumesTurn",
        "cooldownTurns",
        "maxPerPiece",
        "requiresSelection",
        "pieceTypes",
      ];
      if (!hasOnlyKeys(raw, allowed)) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_FIELD",
          path,
          "Champ d'action inconnu.",
        );
      }
      if (
        typeof raw.id !== "string" ||
        !/^[a-z][a-z0-9-]{1,39}$/.test(raw.id) ||
        ids.has(raw.id)
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_ID",
          `${path}.id`,
          "ID d'action invalide ou dupliqué.",
        );
      } else {
        ids.add(raw.id);
      }
      if (
        typeof raw.label !== "string" ||
        raw.label.length < 1 ||
        raw.label.length > 60
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_LABEL",
          `${path}.label`,
          "Label d'action invalide.",
        );
      }
      if (
        typeof raw.description !== "string" ||
        raw.description.length < 3 ||
        raw.description.length > 240
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_DESCRIPTION",
          `${path}.description`,
          "Description d'action invalide.",
        );
      }
      if (
        typeof raw.targetingMode !== "string" ||
        !TARGETING_MODES.includes(raw.targetingMode as never)
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_TARGETING",
          `${path}.targetingMode`,
          "Mode de ciblage invalide.",
        );
      }
      if (
        typeof raw.validTilesProvider !== "string" ||
        !PROVIDERS.includes(raw.validTilesProvider as never)
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_PROVIDER",
          `${path}.validTilesProvider`,
          "Provider invalide.",
        );
      }
      for (const key of ["consumesTurn", "requiresSelection"] as const) {
        if (typeof raw[key] !== "boolean") {
          push(
            diagnostics,
            "BLUEPRINT_ACTION_BOOLEAN",
            `${path}.${key}`,
            `${key} doit être booléen.`,
          );
        }
      }
      for (const key of ["cooldownTurns", "maxPerPiece"] as const) {
        if (
          typeof raw[key] !== "number" ||
          !Number.isInteger(raw[key]) ||
          raw[key] < 0 ||
          raw[key] > (key === "cooldownTurns" ? 20 : 50)
        ) {
          push(
            diagnostics,
            "BLUEPRINT_ACTION_INTEGER",
            `${path}.${key}`,
            `${key} est hors limites.`,
          );
        }
      }
      if (
        !Array.isArray(raw.pieceTypes) ||
        raw.pieceTypes.length < 1 ||
        raw.pieceTypes.length > 7 ||
        !hasUniqueStrings(raw.pieceTypes) ||
        raw.pieceTypes.some(
          (piece) =>
            typeof piece !== "string" || !PIECE_TYPES.includes(piece as never),
        )
      ) {
        push(
          diagnostics,
          "BLUEPRINT_ACTION_PIECES",
          `${path}.pieceTypes`,
          "Types de pièces invalides.",
        );
      }
    });
  }

  const validateArgument = (
    raw: unknown,
    path: string,
    seenNames: Set<string>,
  ) => {
    if (!isRecord(raw)) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_OBJECT",
        path,
        "Argument invalide.",
      );
      return;
    }
    const allowed = [
      "name",
      "kind",
      "stringValue",
      "numberValue",
      "booleanValue",
      "stringListValue",
    ];
    if (!hasOnlyKeys(raw, allowed)) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_FIELD",
        path,
        "Champ d'argument inconnu.",
      );
    }
    if (
      typeof raw.name !== "string" ||
      !/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/.test(raw.name) ||
      seenNames.has(raw.name)
    ) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_NAME",
        `${path}.name`,
        "Nom d'argument invalide ou dupliqué.",
      );
    } else {
      seenNames.add(raw.name);
    }
    if (
      typeof raw.kind !== "string" ||
      !ARGUMENT_KINDS.includes(raw.kind as never)
    ) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_KIND",
        `${path}.kind`,
        "Type d'argument invalide.",
      );
    }
    if (typeof raw.stringValue !== "string" || raw.stringValue.length > 500) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_STRING",
        `${path}.stringValue`,
        "Valeur texte invalide.",
      );
    }
    if (
      typeof raw.numberValue !== "number" ||
      !Number.isFinite(raw.numberValue) ||
      raw.numberValue < -100000 ||
      raw.numberValue > 100000
    ) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_NUMBER",
        `${path}.numberValue`,
        "Valeur numérique invalide.",
      );
    }
    if (typeof raw.booleanValue !== "boolean") {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_BOOLEAN",
        `${path}.booleanValue`,
        "Valeur booléenne invalide.",
      );
    }
    if (
      !Array.isArray(raw.stringListValue) ||
      raw.stringListValue.length > 32 ||
      raw.stringListValue.some(
        (item) => typeof item !== "string" || item.length > 100,
      )
    ) {
      push(
        diagnostics,
        "BLUEPRINT_ARGUMENT_LIST",
        `${path}.stringListValue`,
        "Liste invalide.",
      );
    }
  };

  if (
    !Array.isArray(input.triggers) ||
    input.triggers.length < 1 ||
    input.triggers.length > 12
  ) {
    push(
      diagnostics,
      "BLUEPRINT_TRIGGERS",
      "$.triggers",
      "triggers doit contenir entre 1 et 12 éléments.",
    );
  } else {
    const triggerIds = new Set<string>();
    input.triggers.forEach((raw, index) => {
      const path = `$.triggers[${index}]`;
      if (!isRecord(raw)) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_OBJECT",
          path,
          "Trigger invalide.",
        );
        return;
      }
      const allowed = [
        "id",
        "event",
        "actionId",
        "priority",
        "conditions",
        "effects",
        "onFailure",
        "message",
      ];
      if (!hasOnlyKeys(raw, allowed)) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_FIELD",
          path,
          "Champ de trigger inconnu.",
        );
      }
      if (
        typeof raw.id !== "string" ||
        !/^[a-z][a-z0-9-]{1,49}$/.test(raw.id) ||
        triggerIds.has(raw.id)
      ) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_ID",
          `${path}.id`,
          "ID de trigger invalide ou dupliqué.",
        );
      } else {
        triggerIds.add(raw.id);
      }
      if (
        typeof raw.event !== "string" ||
        !RULE_EVENTS.includes(raw.event as never)
      ) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_EVENT",
          `${path}.event`,
          "Événement invalide.",
        );
      }
      if (typeof raw.actionId !== "string" || raw.actionId.length > 40) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_ACTION",
          `${path}.actionId`,
          "Référence d'action invalide.",
        );
      }
      if (
        typeof raw.priority !== "number" ||
        !Number.isInteger(raw.priority) ||
        raw.priority < -100 ||
        raw.priority > 100
      ) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_PRIORITY",
          `${path}.priority`,
          "Priorité invalide.",
        );
      }
      if (raw.onFailure !== "blockAction" && raw.onFailure !== "skip") {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_FAILURE",
          `${path}.onFailure`,
          "Stratégie d'échec invalide.",
        );
      }
      if (typeof raw.message !== "string" || raw.message.length > 240) {
        push(
          diagnostics,
          "BLUEPRINT_TRIGGER_MESSAGE",
          `${path}.message`,
          "Message invalide.",
        );
      }

      if (!Array.isArray(raw.conditions) || raw.conditions.length > 12) {
        push(
          diagnostics,
          "BLUEPRINT_CONDITIONS",
          `${path}.conditions`,
          "Conditions invalides.",
        );
      } else {
        const conditionIds = new Set<string>();
        raw.conditions.forEach((condition, conditionIndex) => {
          const conditionPath = `${path}.conditions[${conditionIndex}]`;
          if (!isRecord(condition)) {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_OBJECT",
              conditionPath,
              "Condition invalide.",
            );
            return;
          }
          if (!hasOnlyKeys(condition, ["id", "op", "arguments", "negate"])) {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_FIELD",
              conditionPath,
              "Champ de condition inconnu.",
            );
          }
          if (
            typeof condition.id !== "string" ||
            !/^[a-z][a-z0-9-]{1,49}$/.test(condition.id) ||
            conditionIds.has(condition.id)
          ) {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_ID",
              `${conditionPath}.id`,
              "ID de condition invalide ou dupliqué.",
            );
          } else {
            conditionIds.add(condition.id);
          }
          if (
            typeof condition.op !== "string" ||
            !CONDITION_OPS.includes(condition.op as never)
          ) {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_OP",
              `${conditionPath}.op`,
              "Opération de condition invalide.",
            );
          }
          if (typeof condition.negate !== "boolean") {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_NEGATE",
              `${conditionPath}.negate`,
              "negate doit être booléen.",
            );
          }
          if (
            !Array.isArray(condition.arguments) ||
            condition.arguments.length > 12
          ) {
            push(
              diagnostics,
              "BLUEPRINT_CONDITION_ARGUMENTS",
              `${conditionPath}.arguments`,
              "Arguments invalides.",
            );
          } else {
            const names = new Set<string>();
            condition.arguments.forEach((argument, argumentIndex) =>
              validateArgument(
                argument,
                `${conditionPath}.arguments[${argumentIndex}]`,
                names,
              ),
            );
          }
        });
      }

      if (
        !Array.isArray(raw.effects) ||
        raw.effects.length < 1 ||
        raw.effects.length > 16
      ) {
        push(
          diagnostics,
          "BLUEPRINT_EFFECTS",
          `${path}.effects`,
          "Effets invalides.",
        );
      } else {
        const effectIds = new Set<string>();
        raw.effects.forEach((effect, effectIndex) => {
          const effectPath = `${path}.effects[${effectIndex}]`;
          if (!isRecord(effect)) {
            push(
              diagnostics,
              "BLUEPRINT_EFFECT_OBJECT",
              effectPath,
              "Effet invalide.",
            );
            return;
          }
          if (!hasOnlyKeys(effect, ["id", "op", "arguments"])) {
            push(
              diagnostics,
              "BLUEPRINT_EFFECT_FIELD",
              effectPath,
              "Champ d'effet inconnu.",
            );
          }
          if (
            typeof effect.id !== "string" ||
            !/^[a-z][a-z0-9-]{1,49}$/.test(effect.id) ||
            effectIds.has(effect.id)
          ) {
            push(
              diagnostics,
              "BLUEPRINT_EFFECT_ID",
              `${effectPath}.id`,
              "ID d'effet invalide ou dupliqué.",
            );
          } else {
            effectIds.add(effect.id);
          }
          if (
            typeof effect.op !== "string" ||
            !EFFECT_OPS.includes(effect.op as never)
          ) {
            push(
              diagnostics,
              "BLUEPRINT_EFFECT_OP",
              `${effectPath}.op`,
              "Opération d'effet invalide.",
            );
          }
          if (
            !Array.isArray(effect.arguments) ||
            effect.arguments.length > 12
          ) {
            push(
              diagnostics,
              "BLUEPRINT_EFFECT_ARGUMENTS",
              `${effectPath}.arguments`,
              "Arguments invalides.",
            );
          } else {
            const names = new Set<string>();
            effect.arguments.forEach((argument, argumentIndex) =>
              validateArgument(
                argument,
                `${effectPath}.arguments[${argumentIndex}]`,
                names,
              ),
            );
          }
        });
      }
    });
  }

  if (!isRecord(input.balance)) {
    push(
      diagnostics,
      "BLUEPRINT_BALANCE",
      "$.balance",
      "Bloc balance invalide.",
    );
  } else {
    if (
      !hasOnlyKeys(input.balance, ["powerLevel", "counterplay", "limitations"])
    ) {
      push(
        diagnostics,
        "BLUEPRINT_BALANCE_FIELD",
        "$.balance",
        "Champ balance inconnu.",
      );
    }
    if (
      typeof input.balance.powerLevel !== "number" ||
      !Number.isInteger(input.balance.powerLevel) ||
      input.balance.powerLevel < 1 ||
      input.balance.powerLevel > 5
    ) {
      push(
        diagnostics,
        "BLUEPRINT_POWER_LEVEL",
        "$.balance.powerLevel",
        "Niveau de puissance invalide.",
      );
    }
    for (const key of ["counterplay", "limitations"] as const) {
      const value = input.balance[key];
      if (
        !Array.isArray(value) ||
        value.length < 1 ||
        value.length > 8 ||
        value.some(
          (item) =>
            typeof item !== "string" || item.length < 3 || item.length > 240,
        )
      ) {
        push(
          diagnostics,
          "BLUEPRINT_BALANCE_LIST",
          `$.balance.${key}`,
          `${key} est invalide.`,
        );
      }
    }
  }

  if (!isRecord(input.explanation)) {
    push(
      diagnostics,
      "BLUEPRINT_EXPLANATION",
      "$.explanation",
      "Bloc explanation invalide.",
    );
  } else {
    if (!hasOnlyKeys(input.explanation, ["plainLanguage", "examples"])) {
      push(
        diagnostics,
        "BLUEPRINT_EXPLANATION_FIELD",
        "$.explanation",
        "Champ explanation inconnu.",
      );
    }
    if (
      typeof input.explanation.plainLanguage !== "string" ||
      input.explanation.plainLanguage.length < 20 ||
      input.explanation.plainLanguage.length > 1200
    ) {
      push(
        diagnostics,
        "BLUEPRINT_PLAIN_LANGUAGE",
        "$.explanation.plainLanguage",
        "Explication invalide.",
      );
    }
    const examples = input.explanation.examples;
    if (
      !Array.isArray(examples) ||
      examples.length < 1 ||
      examples.length > 6 ||
      examples.some(
        (item) =>
          typeof item !== "string" || item.length < 5 || item.length > 400,
      )
    ) {
      push(
        diagnostics,
        "BLUEPRINT_EXAMPLES",
        "$.explanation.examples",
        "Exemples invalides.",
      );
    }
  }

  return diagnostics.length > 0
    ? { value: null, diagnostics }
    : { value: input as unknown as RuleBlueprintV2, diagnostics };
}
