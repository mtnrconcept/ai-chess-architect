import { describe, expect, it, vi } from "vitest";
import type { RuleGuidanceResponse } from "./guidance-api";
import {
  loadRuleArchitectSession,
  parseRuleArchitectSession,
  persistRuleArchitectDraft,
  persistRuleArchitectWorkflow,
  resolveRuleArchitectRequestAttempt,
  RULE_ARCHITECT_SESSION_KEY,
  RULE_ARCHITECT_SESSION_TTL_MS,
  serializeRuleArchitectSession,
  type SessionStorageLike,
} from "./rule-architect-session";

class MemorySessionStorage implements SessionStorageLike {
  private readonly values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

const idea = "Le fou gèle une pièce ennemie pendant deux tours.";

const guidanceBase: Omit<RuleGuidanceResponse, "guidanceToken"> = {
  feasibility: "direct",
  summary: "Le fou peut geler une cible avec un contre-jeu clair.",
  draftPrompt:
    "Un fou peut geler une pièce ennemie pendant deux tours avec un délai de récupération.",
  requirements: [
    {
      id: "freeze-target",
      statement: "Le fou gèle une pièce ennemie pendant deux tours.",
      importance: "core",
      feasibility: "direct",
      adaptation: "",
    },
  ],
  questions: ["duration", "cooldown"].map((questionId) => ({
    id: questionId,
    question: `Quel réglage choisir pour ${questionId} ?`,
    help: "Ce réglage maintient une partie équilibrée.",
    selectionMode: "single" as const,
    minSelections: 1,
    maxSelections: 1,
    choices: ["one", "two", "three"].map((choiceId, index) => ({
      id: `${questionId}-${choiceId}`,
      label: `Option ${index + 1}`,
      description: "Une option de règle clairement définie.",
      recommended: index === 1,
    })),
  })),
  adjustments: [],
  remainingUncertainty: [],
  model: "gpt-5.6-terra",
};

const guidanceToken = (
  issuedAtSeconds: number,
  serverPrompt = idea,
): string => {
  const payload = Buffer.from(
    JSON.stringify({
      version: 1,
      issuedAt: issuedAtSeconds,
      expiresAt: issuedAtSeconds + 60 * 60,
      originalPrompt: serverPrompt,
      guidance: {},
    }),
  ).toString("base64url");
  return `${payload}.${Buffer.from("test-signature").toString("base64url")}`;
};

const draft = (
  token: string,
): Parameters<typeof persistRuleArchitectDraft>[0] => ({
  idea,
  analyzedIdea: idea,
  guidance: { ...guidanceBase, guidanceToken: token },
  selections: { duration: [], cooldown: [] },
  acceptedAdjustmentIds: [],
  premium: false,
  visibility: "unlisted",
  lobbyName: "Ma variante Voltus",
  mode: "ai",
});

describe("Rule Architect session persistence", () => {
  it("round-trips a bounded, versioned draft in session storage", () => {
    const storage = new MemorySessionStorage();
    const now = 1_700_000_000_000;
    const token = guidanceToken(now / 1000);

    const saved = persistRuleArchitectDraft(draft(token), {
      storage,
      now,
      renewFromGuidanceToken: token,
    });

    expect(saved).toMatchObject({
      version: 1,
      createdAt: now,
      expiresAt: now + RULE_ARCHITECT_SESSION_TTL_MS,
      draft: {
        idea,
        guidance: { guidanceToken: token },
      },
    });
    const serialized = storage.getItem(RULE_ARCHITECT_SESSION_KEY);
    expect(serialized).not.toBeNull();
    expect(parseRuleArchitectSession(serialized as string, now + 1)).toEqual(
      saved,
    );
    expect(serializeRuleArchitectSession(saved!, now + 1)).toBe(serialized);
  });

  it("never persists beyond token expiry and clears an expired record", () => {
    const storage = new MemorySessionStorage();
    const now = 1_700_000_010_000;
    const tokenIssuedTenSecondsEarlier = guidanceToken(now / 1000 - 10);

    const saved = persistRuleArchitectDraft(
      draft(tokenIssuedTenSecondsEarlier),
      {
        storage,
        now,
        renewFromGuidanceToken: tokenIssuedTenSecondsEarlier,
      },
    );

    expect(saved?.expiresAt).toBe(now + RULE_ARCHITECT_SESSION_TTL_MS - 10_000);
    expect(loadRuleArchitectSession(storage, saved!.expiresAt)).toBeNull();
    expect(storage.getItem(RULE_ARCHITECT_SESSION_KEY)).toBeNull();
  });

  it("accepts a server-normalized token prompt without extending its TTL", () => {
    const storage = new MemorySessionStorage();
    const now = 1_700_000_020_000;
    const normalizedToken = guidanceToken(
      now / 1000,
      "Le fou gèle une pièce ennemie pendant 2 tours.",
    );

    const saved = persistRuleArchitectDraft(draft(normalizedToken), {
      storage,
      now,
      renewFromGuidanceToken: normalizedToken,
    });

    expect(saved?.draft.idea).toBe(idea);
    expect(saved?.expiresAt).toBe(now + RULE_ARCHITECT_SESSION_TTL_MS);
  });

  it("fails closed and clears malformed persisted JSON", () => {
    const storage = new MemorySessionStorage();
    storage.setItem(
      RULE_ARCHITECT_SESSION_KEY,
      JSON.stringify({ version: 999, guidanceToken: "forged" }),
    );

    expect(loadRuleArchitectSession(storage, 1_700_000_000_000)).toBeNull();
    expect(storage.getItem(RULE_ARCHITECT_SESSION_KEY)).toBeNull();
  });

  it("round-trips compilation, publication, lobby and request attempts", () => {
    const storage = new MemorySessionStorage();
    const now = 1_700_000_030_000;
    const token = guidanceToken(now / 1000);
    persistRuleArchitectDraft(draft(token), {
      storage,
      now,
      renewFromGuidanceToken: token,
    });

    const compilation = {
      compilationId: "00000000-0000-4000-8000-000000000910",
      ok: true,
      blueprint: {
        schemaVersion: "2.0.0" as const,
        ruleKey: "freeze-bishop",
        title: "Fou de glace",
        summary: "Le fou peut geler une pièce ennemie pendant deux tours.",
        category: "special" as const,
        tags: ["glace"],
        affectedPieces: ["bishop" as const],
        sides: ["white" as const, "black" as const],
        stateNamespace: "freeze.bishop",
        initialStateJson: "{}",
        actions: [],
        triggers: [],
        balance: {
          powerLevel: 2,
          counterplay: ["Attendre la fin du gel."],
          limitations: ["Une cible à la fois."],
        },
        explanation: {
          plainLanguage: "Le fou choisit une cible ennemie et la gèle.",
          examples: ["Le fou en c4 gèle le cavalier en d5."],
        },
      },
      compiledRule: {
        meta: {
          ruleId: "freeze-bishop@draft",
          ruleName: "Fou de glace",
          version: "2.0.0",
          description: "Le fou gèle une cible.",
          category: "special" as const,
          priority: 0,
          isActive: true,
          tags: ["glace"],
        },
        scope: { affectedPieces: ["bishop"], sides: ["white" as const] },
        ui: { actions: [] },
        state: {
          namespace: "freeze.bishop",
          schema: {},
          initial: {},
          serialize: true,
        },
        logic: { effects: [] },
        integration: {
          ruleArchitect: {
            schemaVersion: "2.0.0",
            engineVersion: "2.0.0",
            source: "ai-blueprint" as const,
            blueprintRuleKey: "freeze-bishop",
          },
        },
        createdAt: "2026-07-22T00:00:00.000Z",
      },
      diagnostics: [],
      metrics: {
        riskScore: 10,
        balanceScore: 90,
        complexity: "low" as const,
        triggerCount: 0,
        effectCount: 0,
        actionCount: 0,
      },
      contentHash: "content-hash",
      model: "gpt-5.6-terra",
      premiumRequested: false,
      premiumGranted: false,
      requestId: "resp_test",
      generationDurationMs: 100,
      coverage: {
        complete: true,
        exactIntentPreserved: true,
        score: 100,
        summary: "Toutes les exigences sont couvertes.",
        requirements: [],
      },
    };
    const publication = {
      blueprintId: "00000000-0000-4000-8000-000000000911",
      versionId: "00000000-0000-4000-8000-000000000912",
      versionNumber: 1,
      legacyRuleId: "freeze-bishop-00000000000040008000000000000911@v1",
      contentHash: "content-hash",
    };
    const lobby = {
      lobbyId: "00000000-0000-4000-8000-000000000913",
      rulesetHash: "ruleset-hash",
      matchSeed: 42,
      legacyRuleIds: [publication.legacyRuleId],
    };
    const compileAttempt = {
      fingerprint: "compile-fingerprint",
      requestKey: "00000000-0000-4000-8000-000000000914",
    };

    persistRuleArchitectWorkflow(
      { compilation, publication, lobby, compileAttempt },
      { storage, now: now + 1 },
    );

    expect(loadRuleArchitectSession(storage, now + 2)?.workflow).toEqual({
      compilation,
      publication,
      lobby,
      compileAttempt,
      lobbyAttempt: null,
    });
  });

  it("reuses a request key for the same fingerprint after hydration", () => {
    const create = vi.fn(() => "00000000-0000-4000-8000-000000000901");
    const restored = {
      fingerprint: "same-compile-input",
      requestKey: "00000000-0000-4000-8000-000000000900",
    };

    expect(
      resolveRuleArchitectRequestAttempt(
        restored,
        "same-compile-input",
        create,
      ),
    ).toBe(restored);
    expect(create).not.toHaveBeenCalled();

    expect(
      resolveRuleArchitectRequestAttempt(
        restored,
        "different-compile-input",
        create,
      ),
    ).toEqual({
      fingerprint: "different-compile-input",
      requestKey: "00000000-0000-4000-8000-000000000901",
    });
    expect(create).toHaveBeenCalledOnce();
  });
});
