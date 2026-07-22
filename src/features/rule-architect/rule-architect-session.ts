import { z } from "zod";
import type {
  CompileRuleResponse,
  CreatedRuleLobby,
  PublishedRuleVersion,
} from "@/rules-v2";
import type {
  RuleGuidanceResponse,
  RuleGuidanceSelections,
} from "./guidance-api";
import {
  compileRuleResponseSchema,
  createdRuleLobbyResponseSchema,
  publishedRuleVersionSchema,
  ruleGuidanceResponseSchema,
} from "./edge-response-schemas";

export const RULE_ARCHITECT_SESSION_KEY = "voltus.rule-architect.session.v1";
export const RULE_ARCHITECT_SESSION_TTL_MS = 60 * 60 * 1000;
export const RULE_ARCHITECT_SESSION_MAX_CHARS = 512_000;

const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface RuleArchitectRequestAttempt {
  fingerprint: string;
  requestKey: string;
}

export interface PersistedRuleArchitectDraft {
  idea: string;
  analyzedIdea: string | null;
  guidance: RuleGuidanceResponse | null;
  selections: Record<string, string[]>;
  acceptedAdjustmentIds: string[];
  premium: boolean;
  visibility: "private" | "unlisted" | "public";
  lobbyName: string;
  mode: "ai";
}

export interface PersistedRuleArchitectWorkflow {
  compilation: CompileRuleResponse | null;
  publication: PublishedRuleVersion | null;
  lobby: CreatedRuleLobby | null;
  compileAttempt: RuleArchitectRequestAttempt | null;
  lobbyAttempt: RuleArchitectRequestAttempt | null;
}

export interface PersistedRuleArchitectSession {
  version: 1;
  createdAt: number;
  savedAt: number;
  expiresAt: number;
  draft: PersistedRuleArchitectDraft;
  workflow: PersistedRuleArchitectWorkflow;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const requestAttemptSchema = z
  .object({
    fingerprint: z.string().min(1).max(80_000),
    requestKey: z.string().regex(UUID_V4_PATTERN),
  })
  .strict();

const selectionsSchema = z
  .record(z.string().min(1).max(40), z.array(z.string().min(1).max(40)).max(5))
  .superRefine((selections, context) => {
    if (Object.keys(selections).length > 6) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Trop de réponses persistées.",
      });
    }
  });

const draftSchema = z
  .object({
    idea: z.string().max(6000),
    analyzedIdea: z.string().max(6000).nullable(),
    guidance: ruleGuidanceResponseSchema.nullable(),
    selections: selectionsSchema,
    acceptedAdjustmentIds: z.array(z.string().min(1).max(40)).max(5),
    premium: z.boolean(),
    visibility: z.enum(["private", "unlisted", "public"]),
    lobbyName: z.string().max(80),
    mode: z.literal("ai"),
  })
  .strict()
  .superRefine((draft, context) => {
    if (!draft.guidance) {
      if (
        draft.analyzedIdea !== null ||
        Object.keys(draft.selections).length > 0 ||
        draft.acceptedAdjustmentIds.length > 0
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "Un brouillon sans guidage ne peut pas contenir de réponses.",
        });
      }
      return;
    }

    if (draft.analyzedIdea !== draft.idea.trim()) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["analyzedIdea"],
        message: "Le guidage ne correspond plus à l’idée.",
      });
    }

    const questionsById = new Map(
      draft.guidance.questions.map((question) => [question.id, question]),
    );
    Object.entries(draft.selections).forEach(([questionId, choiceIds]) => {
      const question = questionsById.get(questionId);
      if (!question) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selections", questionId],
          message: "La réponse cible une question inconnue.",
        });
        return;
      }
      const knownChoiceIds = new Set(
        question.choices.map((choice) => choice.id),
      );
      if (
        new Set(choiceIds).size !== choiceIds.length ||
        choiceIds.some((choiceId) => !knownChoiceIds.has(choiceId))
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["selections", questionId],
          message: "La réponse contient un choix inconnu ou dupliqué.",
        });
      }
    });

    const adjustmentIds = new Set(
      draft.guidance.adjustments.map((adjustment) => adjustment.id),
    );
    if (
      new Set(draft.acceptedAdjustmentIds).size !==
        draft.acceptedAdjustmentIds.length ||
      draft.acceptedAdjustmentIds.some(
        (adjustmentId) => !adjustmentIds.has(adjustmentId),
      )
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["acceptedAdjustmentIds"],
        message: "Un ajustement persisté est inconnu ou dupliqué.",
      });
    }
  });

const workflowSchema = z
  .object({
    compilation: compileRuleResponseSchema.nullable(),
    publication: publishedRuleVersionSchema.nullable(),
    lobby: createdRuleLobbyResponseSchema.nullable(),
    compileAttempt: requestAttemptSchema.nullable(),
    lobbyAttempt: requestAttemptSchema.nullable(),
  })
  .strict()
  .superRefine((workflow, context) => {
    if (workflow.publication && !workflow.compilation?.ok) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["publication"],
        message: "Une publication exige une compilation valide.",
      });
    }
    if (workflow.lobby && !workflow.publication) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["lobby"],
        message: "Un lobby exige une publication.",
      });
    }
  });

const sessionSchema = z
  .object({
    version: z.literal(1),
    createdAt: z.number().int().nonnegative(),
    savedAt: z.number().int().nonnegative(),
    expiresAt: z.number().int().positive(),
    draft: draftSchema,
    workflow: workflowSchema,
  })
  .strict()
  .superRefine((session, context) => {
    if (
      session.savedAt < session.createdAt ||
      session.expiresAt <= session.createdAt ||
      session.expiresAt - session.createdAt > RULE_ARCHITECT_SESSION_TTL_MS
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "La durée de session est invalide.",
      });
    }
  });

const emptyDraft = (): PersistedRuleArchitectDraft => ({
  idea: "",
  analyzedIdea: null,
  guidance: null,
  selections: {},
  acceptedAdjustmentIds: [],
  premium: false,
  visibility: "unlisted",
  lobbyName: "Ma variante Voltus",
  mode: "ai",
});

const emptyWorkflow = (): PersistedRuleArchitectWorkflow => ({
  compilation: null,
  publication: null,
  lobby: null,
  compileAttempt: null,
  lobbyAttempt: null,
});

const browserSessionStorage = (): SessionStorageLike | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

type GuidanceTokenClaims = {
  originalPrompt: string;
  issuedAtMs: number;
  expiresAtMs: number;
};

export function readGuidanceTokenClaims(
  token: string,
): GuidanceTokenClaims | null {
  try {
    if (!token || token.length > 60_000) return null;
    const parts = token.split(".");
    if (
      parts.length !== 2 ||
      !parts.every((part) => /^[A-Za-z0-9_-]+$/.test(part))
    ) {
      return null;
    }

    const padded = parts[0]
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(Math.ceil(parts[0].length / 4) * 4, "=");
    const binary = globalThis.atob(padded);
    const bytes = Uint8Array.from(binary, (character) =>
      character.charCodeAt(0),
    );
    const payload = JSON.parse(new TextDecoder().decode(bytes)) as unknown;
    const claims = z
      .object({
        version: z.literal(1),
        issuedAt: z.number().int(),
        expiresAt: z.number().int(),
        originalPrompt: z.string().max(6000),
      })
      .passthrough()
      .safeParse(payload);

    if (
      !claims.success ||
      claims.data.expiresAt - claims.data.issuedAt !== 60 * 60
    ) {
      return null;
    }

    return {
      originalPrompt: claims.data.originalPrompt,
      issuedAtMs: claims.data.issuedAt * 1000,
      expiresAtMs: claims.data.expiresAt * 1000,
    };
  } catch {
    return null;
  }
}

const validateSession = (
  value: unknown,
  now: number,
): PersistedRuleArchitectSession | null => {
  const parsed = sessionSchema.safeParse(value);
  if (
    !parsed.success ||
    parsed.data.expiresAt <= now ||
    parsed.data.savedAt >= parsed.data.expiresAt ||
    parsed.data.createdAt > now + 60_000 ||
    parsed.data.savedAt > now + 60_000
  ) {
    return null;
  }

  const guidance = parsed.data.draft.guidance;
  if (guidance) {
    const claims = readGuidanceTokenClaims(guidance.guidanceToken);
    if (
      !claims ||
      claims.issuedAtMs > now + 60_000 ||
      parsed.data.expiresAt > claims.expiresAtMs
    ) {
      return null;
    }
  }

  return parsed.data as unknown as PersistedRuleArchitectSession;
};

export function serializeRuleArchitectSession(
  session: PersistedRuleArchitectSession,
  now = Date.now(),
): string | null {
  const validated = validateSession(session, now);
  if (!validated) return null;
  const serialized = JSON.stringify(validated);
  return serialized.length <= RULE_ARCHITECT_SESSION_MAX_CHARS
    ? serialized
    : null;
}

export function parseRuleArchitectSession(
  serialized: string,
  now = Date.now(),
): PersistedRuleArchitectSession | null {
  if (!serialized || serialized.length > RULE_ARCHITECT_SESSION_MAX_CHARS) {
    return null;
  }
  try {
    return validateSession(JSON.parse(serialized) as unknown, now);
  } catch {
    return null;
  }
}

export function loadRuleArchitectSession(
  storage: SessionStorageLike | null = browserSessionStorage(),
  now = Date.now(),
): PersistedRuleArchitectSession | null {
  if (!storage) return null;
  try {
    const serialized = storage.getItem(RULE_ARCHITECT_SESSION_KEY);
    if (!serialized) return null;
    const session = parseRuleArchitectSession(serialized, now);
    if (!session) storage.removeItem(RULE_ARCHITECT_SESSION_KEY);
    return session;
  } catch {
    try {
      storage.removeItem(RULE_ARCHITECT_SESSION_KEY);
    } catch {
      // Le stockage est indisponible ; le parcours reste utilisable en mémoire.
    }
    return null;
  }
}

export function clearRuleArchitectSession(
  storage: SessionStorageLike | null = browserSessionStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(RULE_ARCHITECT_SESSION_KEY);
  } catch {
    // Le stockage est optionnel ; l’état React sera tout de même réinitialisé.
  }
}

type PersistSessionOptions = {
  storage?: SessionStorageLike | null;
  now?: number;
  renewFromGuidanceToken?: string;
};

export function persistRuleArchitectDraft(
  draft: PersistedRuleArchitectDraft,
  options: PersistSessionOptions = {},
): PersistedRuleArchitectSession | null {
  return updateRuleArchitectSession({ draft }, options);
}

export function persistRuleArchitectWorkflow(
  workflow: Partial<PersistedRuleArchitectWorkflow>,
  options: Omit<PersistSessionOptions, "renewFromGuidanceToken"> = {},
): PersistedRuleArchitectSession | null {
  return updateRuleArchitectSession({ workflow }, options);
}

function updateRuleArchitectSession(
  patch: {
    draft?: PersistedRuleArchitectDraft;
    workflow?: Partial<PersistedRuleArchitectWorkflow>;
  },
  options: PersistSessionOptions,
): PersistedRuleArchitectSession | null {
  const storage = options.storage ?? browserSessionStorage();
  if (!storage) return null;
  const now = options.now ?? Date.now();
  const current = loadRuleArchitectSession(storage, now);

  if (!current && !patch.draft) return null;

  let createdAt = current?.createdAt ?? now;
  let expiresAt = current?.expiresAt ?? now + RULE_ARCHITECT_SESSION_TTL_MS;
  const draft = patch.draft ?? current?.draft ?? emptyDraft();

  if (options.renewFromGuidanceToken) {
    const claims = readGuidanceTokenClaims(options.renewFromGuidanceToken);
    if (
      !claims ||
      claims.issuedAtMs > now + 60_000 ||
      claims.expiresAtMs <= now
    ) {
      clearRuleArchitectSession(storage);
      return null;
    }
    createdAt = now;
    expiresAt = Math.min(
      now + RULE_ARCHITECT_SESSION_TTL_MS,
      claims.expiresAtMs,
    );
  } else if (!current && draft.guidance) {
    // Un jeton restauré ne doit jamais ouvrir une nouvelle fenêtre de validité.
    return null;
  }

  const candidate: PersistedRuleArchitectSession = {
    version: 1,
    createdAt,
    savedAt: now,
    expiresAt,
    draft,
    workflow: {
      ...(current?.workflow ?? emptyWorkflow()),
      ...patch.workflow,
    },
  };
  const serialized = serializeRuleArchitectSession(candidate, now);
  if (!serialized) {
    clearRuleArchitectSession(storage);
    return null;
  }

  try {
    storage.setItem(RULE_ARCHITECT_SESSION_KEY, serialized);
    return parseRuleArchitectSession(serialized, now);
  } catch {
    return null;
  }
}

export function resolveRuleArchitectRequestAttempt(
  current: RuleArchitectRequestAttempt | null,
  fingerprint: string,
  create: () => string,
): RuleArchitectRequestAttempt {
  if (current?.fingerprint === fingerprint) return current;
  return { fingerprint, requestKey: create() };
}

export const toGuidanceSelections = (
  draft: PersistedRuleArchitectDraft,
): RuleGuidanceSelections => ({
  answers: draft.selections,
  acceptedAdjustmentIds: draft.acceptedAdjustmentIds,
});
