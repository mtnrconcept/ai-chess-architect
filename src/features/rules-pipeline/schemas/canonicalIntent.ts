import { z } from "zod";
import type { JSONSchemaType } from "ajv";

const targetingSchema = z
  .object({
    mode: z.enum(["none", "tile", "piece", "area", "pair", "path"]),
    provider: z.string().min(1),
    params: z.record(z.any()).default({}),
  })
  .partial({ params: true });

const requirementSchema = z
  .object({
    kingSafety: z.boolean().default(false),
    pathClear: z.boolean().default(false),
    noTargetKing: z.boolean().default(false),
  })
  .partial();

const limitsSchema = z
  .object({
    cooldownPerPiece: z.number().int().nonnegative().optional(),
    oncePerMatch: z.boolean().optional(),
    chargesPerMatch: z.number().int().positive().optional(),
    duration: z.number().int().positive().optional(),
  })
  .partial();

export const canonicalIntentSchema = z.object({
  ruleName: z.string().min(1),
  text: z.string().min(1),
  category: z.string().optional(),
  templateId: z.string().min(1),
  affectedPieces: z.array(z.string().min(1)).nonempty(),
  mechanics: z.array(z.string().min(1)).nonempty(),
  hazards: z.array(z.string().min(1)).optional(),
  statuses: z.array(z.string().min(1)).optional(),
  targeting: targetingSchema.optional(),
  limits: limitsSchema.optional(),
  sfx: z.array(z.string().min(1)).optional(),
  vfx: z.array(z.string().min(1)).optional(),
  textHints: z.array(z.string().min(1)).optional(),
  requirements: requirementSchema.optional(),
  notes: z.array(z.string().min(1)).optional(),
});

export type CanonicalIntent = z.infer<typeof canonicalIntentSchema>;

export const canonicalIntentJsonSchema: any = {
  title: "CanonicalIntent",
  type: "object",
  required: ["ruleName", "text", "templateId", "affectedPieces", "mechanics"],
  properties: {
    ruleName: { type: "string", minLength: 1 },
    text: { type: "string", minLength: 1 },
    category: { type: "string", nullable: true },
    templateId: { type: "string", minLength: 1 },
    affectedPieces: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    mechanics: {
      type: "array",
      minItems: 1,
      items: { type: "string", minLength: 1 },
    },
    hazards: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
    statuses: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
    targeting: {
      type: "object",
      nullable: true,
      required: ["mode", "provider"],
      properties: {
        mode: {
          type: "string",
          enum: ["none", "tile", "piece", "area", "pair", "path"],
        },
        provider: { type: "string", minLength: 1 },
        params: {
          type: "object",
          additionalProperties: true,
          nullable: true,
        },
      },
      additionalProperties: false,
    },
    limits: {
      type: "object",
      nullable: true,
      properties: {
        cooldownPerPiece: {
          type: "integer",
          minimum: 0,
          nullable: true,
        },
        oncePerMatch: { type: "boolean", nullable: true },
        chargesPerMatch: { type: "integer", minimum: 1, nullable: true },
        duration: { type: "integer", minimum: 1, nullable: true },
      },
      additionalProperties: false,
    },
    sfx: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
    vfx: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
    textHints: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
    requirements: {
      type: "object",
      nullable: true,
      properties: {
        kingSafety: { type: "boolean", nullable: true },
        pathClear: { type: "boolean", nullable: true },
        noTargetKing: { type: "boolean", nullable: true },
      },
      additionalProperties: false,
    },
    notes: {
      type: "array",
      nullable: true,
      items: { type: "string", minLength: 1 },
    },
  },
  additionalProperties: false,
};
