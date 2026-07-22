import { z } from "zod";
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
} from "@/rules-v2";

const identifierSchema = z.string().min(1);
const uuidSchema = z.string().uuid();
const legacyRuleIdSchema = z
  .string()
  .max(96)
  .regex(/^[a-z][a-z0-9-]{2,49}-[0-9a-f]{32}@v[1-9][0-9]*$/);

export const functionEnvelopeSchema = z
  .object({
    success: z.boolean(),
    error: z.string().min(1).optional(),
    code: z.string().min(1).optional(),
    retryable: z.boolean().optional(),
    newRequestRequired: z.boolean().optional(),
    data: z.unknown().optional(),
  })
  .passthrough();

const guidanceChoiceSchema = z
  .object({
    id: identifierSchema,
    label: z.string().min(2),
    description: z.string().min(3),
    recommended: z.boolean(),
  })
  .passthrough();

const guidanceQuestionSchema = z
  .object({
    id: identifierSchema,
    question: z.string().min(5),
    help: z.string().min(5),
    selectionMode: z.enum(["single", "multiple"]),
    minSelections: z.number().int().min(1),
    maxSelections: z.number().int().min(1),
    choices: z.array(guidanceChoiceSchema).min(3),
  })
  .passthrough()
  .superRefine((question, context) => {
    if (question.maxSelections > question.choices.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["maxSelections"],
        message: "Le maximum dépasse le nombre de choix.",
      });
    }
    if (question.minSelections > question.maxSelections) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["minSelections"],
        message: "Le minimum dépasse le maximum.",
      });
    }
    if (
      question.selectionMode === "single" &&
      (question.minSelections !== 1 || question.maxSelections !== 1)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["selectionMode"],
        message: "Une question à choix unique doit exiger un seul choix.",
      });
    }

    const choiceIds = question.choices.map((choice) => choice.id);
    if (new Set(choiceIds).size !== choiceIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["choices"],
        message: "Les identifiants de choix doivent être uniques.",
      });
    }
  });

export const ruleGuidanceResponseSchema = z
  .object({
    feasibility: z.enum(["direct", "adaptable", "unsupported"]),
    summary: z.string().min(10),
    draftPrompt: z.string().min(20),
    requirements: z
      .array(
        z
          .object({
            id: identifierSchema,
            statement: z.string().min(5),
            importance: z.enum(["core", "supporting", "cosmetic"]),
            feasibility: z.enum(["direct", "adaptable", "unsupported"]),
            adaptation: z.string(),
          })
          .passthrough(),
      )
      .min(1),
    questions: z.array(guidanceQuestionSchema).min(2),
    adjustments: z.array(
      z
        .object({
          id: identifierSchema,
          label: z.string().min(2),
          description: z.string().min(3),
          recommended: z.boolean(),
          requirementIds: z.array(identifierSchema).min(1),
        })
        .passthrough(),
    ),
    remainingUncertainty: z.array(z.string().min(3)),
    guidanceToken: z.string().min(1),
    model: z.string().min(1),
  })
  .passthrough()
  .superRefine((guidance, context) => {
    const requirementIds = guidance.requirements.map(
      (requirement) => requirement.id,
    );
    if (new Set(requirementIds).size !== requirementIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["requirements"],
        message: "Les identifiants d’exigence doivent être uniques.",
      });
    }

    const knownRequirementIds = new Set(requirementIds);
    guidance.adjustments.forEach((adjustment, adjustmentIndex) => {
      adjustment.requirementIds.forEach((requirementId, requirementIndex) => {
        if (!knownRequirementIds.has(requirementId)) {
          context.addIssue({
            code: z.ZodIssueCode.custom,
            path: [
              "adjustments",
              adjustmentIndex,
              "requirementIds",
              requirementIndex,
            ],
            message: "L’ajustement référence une exigence inconnue.",
          });
        }
      });
    });
  });

const ruleArgumentSchema = z
  .object({
    name: identifierSchema,
    kind: z.enum(ARGUMENT_KINDS),
    stringValue: z.string(),
    numberValue: z.number().finite(),
    booleanValue: z.boolean(),
    stringListValue: z.array(z.string()),
  })
  .passthrough();

const blueprintSchema = z
  .object({
    schemaVersion: z.literal(RULE_SCHEMA_VERSION),
    ruleKey: identifierSchema,
    title: z.string().min(1),
    summary: z.string().min(1),
    category: z.enum(RULE_CATEGORIES),
    tags: z.array(z.string()),
    affectedPieces: z.array(z.enum(PIECE_TYPES)).min(1),
    sides: z.array(z.enum(SIDES)).min(1),
    stateNamespace: identifierSchema,
    initialStateJson: z.string(),
    actions: z.array(
      z
        .object({
          id: identifierSchema,
          label: z.string().min(1),
          description: z.string(),
          targetingMode: z.enum(TARGETING_MODES),
          validTilesProvider: z.enum(PROVIDERS),
          consumesTurn: z.boolean(),
          cooldownTurns: z.number().int().nonnegative(),
          maxPerPiece: z.number().int().nonnegative(),
          requiresSelection: z.boolean(),
          pieceTypes: z.array(z.enum(PIECE_TYPES)).min(1),
        })
        .passthrough(),
    ),
    triggers: z.array(
      z
        .object({
          id: identifierSchema,
          event: z.enum(RULE_EVENTS),
          actionId: z.string(),
          priority: z.number().int(),
          conditions: z.array(
            z
              .object({
                id: identifierSchema,
                op: z.enum(CONDITION_OPS),
                arguments: z.array(ruleArgumentSchema),
                negate: z.boolean(),
              })
              .passthrough(),
          ),
          effects: z
            .array(
              z
                .object({
                  id: identifierSchema,
                  op: z.enum(EFFECT_OPS),
                  arguments: z.array(ruleArgumentSchema),
                })
                .passthrough(),
            )
            .min(1),
          onFailure: z.enum(["blockAction", "skip"]),
          message: z.string(),
        })
        .passthrough(),
    ),
    balance: z
      .object({
        powerLevel: z.number().int(),
        counterplay: z.array(z.string()),
        limitations: z.array(z.string()),
      })
      .passthrough(),
    explanation: z
      .object({
        plainLanguage: z.string().min(1),
        examples: z.array(z.string()),
      })
      .passthrough(),
  })
  .passthrough();

const diagnosticSchema = z
  .object({
    code: identifierSchema,
    severity: z.enum(["error", "warning", "info"]),
    path: z.string(),
    message: z.string().min(1),
  })
  .passthrough();

const metricsSchema = z
  .object({
    riskScore: z.number().finite(),
    balanceScore: z.number().finite(),
    complexity: z.enum(["low", "medium", "high"]),
    triggerCount: z.number().int().nonnegative(),
    effectCount: z.number().int().nonnegative(),
    actionCount: z.number().int().nonnegative(),
  })
  .passthrough();

const coverageSchema = z
  .object({
    complete: z.boolean(),
    exactIntentPreserved: z.boolean(),
    score: z.number().finite().min(0).max(100),
    summary: z.string().min(1),
    requirements: z.array(
      z
        .object({
          id: identifierSchema,
          status: z.enum([
            "implemented",
            "adapted",
            "clarification_required",
            "unsupported",
          ]),
          evidencePaths: z.array(z.string()),
          explanation: z.string().min(1),
          adaptation: z.string(),
          userApproved: z.boolean(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export const compileRuleResponseSchema = z
  .object({
    compilationId: uuidSchema,
    ok: z.boolean(),
    blueprint: blueprintSchema.nullable(),
    // Le JSON compilé est opaque pour le client : son interprétation reste
    // exclusivement du ressort du moteur, mais il doit bien être un objet.
    compiledRule: z.record(z.unknown()).nullable(),
    diagnostics: z.array(diagnosticSchema),
    metrics: metricsSchema,
    contentHash: z.string().min(1).nullable(),
    model: z.string().min(1),
    premiumRequested: z.boolean(),
    premiumGranted: z.boolean(),
    requestId: z.string().min(1).nullable(),
    generationDurationMs: z
      .number()
      .finite()
      .nonnegative()
      .nullable()
      .transform((duration) => duration ?? 0),
    coverage: coverageSchema.nullable(),
  })
  .passthrough()
  .superRefine((compilation, context) => {
    if (!compilation.ok) return;

    if (!compilation.blueprint) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blueprint"],
        message: "Une compilation valide doit fournir son blueprint.",
      });
    }
    if (!compilation.compiledRule) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["compiledRule"],
        message: "Une compilation valide doit fournir sa règle compilée.",
      });
    }
    if (!compilation.contentHash) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["contentHash"],
        message: "Une compilation valide doit fournir son empreinte.",
      });
    }
    if (!compilation.coverage?.complete) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["coverage"],
        message: "Une compilation valide doit avoir une couverture complète.",
      });
    }
  });

export const publishedRuleVersionSchema = z
  .object({
    blueprintId: uuidSchema,
    versionId: uuidSchema,
    versionNumber: z.number().int().positive(),
    legacyRuleId: legacyRuleIdSchema,
    contentHash: z.string().min(1),
  })
  .passthrough();

export const createdRuleLobbyResponseSchema = z
  .object({
    lobbyId: uuidSchema,
    rulesetHash: z.string().min(1),
    matchSeed: z.number().int().safe().nullable(),
    legacyRuleIds: z.array(legacyRuleIdSchema).min(1),
  })
  .passthrough();
