import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  requireSupabaseClient: () => ({
    functions: { invoke },
  }),
}));

import {
  compileChessRule,
  createRuleLobby,
  publishRuleVersion,
  RuleArchitectApiError,
} from "./api";

const rejectedCompilation = {
  compilationId: "00000000-0000-4000-8000-000000000201",
  ok: false,
  blueprint: null,
  compiledRule: null,
  diagnostics: [],
  metrics: {
    riskScore: 0,
    balanceScore: 0,
    complexity: "low",
    triggerCount: 0,
    effectCount: 0,
    actionCount: 0,
  },
  contentHash: null,
  model: "gpt-5.6-terra",
  premiumRequested: false,
  premiumGranted: false,
  requestId: null,
  // Les anciennes compilations rejouées peuvent ne pas avoir cette métrique.
  generationDurationMs: null,
  coverage: null,
};

describe("Rule Architect API idempotency contract", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("forwards the stable request key when compiling", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: rejectedCompilation,
      },
      error: null,
    });

    await compileChessRule({
      prompt: "Une règle suffisamment détaillée et bornée.",
      premium: false,
      requestKey: "00000000-0000-4000-8000-000000000001",
    });

    expect(invoke).toHaveBeenCalledWith("compile-chess-rule", {
      body: {
        prompt: "Une règle suffisamment détaillée et bornée.",
        premium: false,
        requestKey: "00000000-0000-4000-8000-000000000001",
      },
    });
  });

  it("forwards signed guidance and explicit user selections", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: rejectedCompilation,
      },
      error: null,
    });

    const guidanceSelections = {
      answers: { duration: ["two-turns"] },
      acceptedAdjustmentIds: ["managed-animation"],
    };

    await compileChessRule({
      prompt: "Une règle suffisamment détaillée et bornée.",
      premium: false,
      requestKey: "00000000-0000-4000-8000-000000000004",
      guidanceToken: "signed.guidance",
      guidanceSelections,
    });

    expect(invoke).toHaveBeenCalledWith("compile-chess-rule", {
      body: {
        prompt: "Une règle suffisamment détaillée et bornée.",
        premium: false,
        requestKey: "00000000-0000-4000-8000-000000000004",
        guidanceToken: "signed.guidance",
        guidanceSelections,
      },
    });
  });

  it("forwards the stable request key and accepts a pending player seed", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: {
          lobbyId: "00000000-0000-4000-8000-000000000202",
          rulesetHash: "hash",
          matchSeed: null,
          legacyRuleIds: ["freeze-bishop-00000000000040008000000000000203@v1"],
        },
      },
      error: null,
    });

    const result = await createRuleLobby({
      name: "Lobby joueur",
      mode: "player",
      ruleVersionIds: ["version"],
      requestKey: "00000000-0000-4000-8000-000000000002",
    });

    expect(result.matchSeed).toBeNull();
    expect(invoke).toHaveBeenCalledWith("create-rule-lobby-v2", {
      body: {
        name: "Lobby joueur",
        mode: "player",
        ruleVersionIds: ["version"],
        requestKey: "00000000-0000-4000-8000-000000000002",
      },
    });
  });

  it("accepts the deterministic legacy id returned by publication", async () => {
    const publication = {
      blueprintId: "00000000-0000-4000-8000-000000000204",
      versionId: "00000000-0000-4000-8000-000000000205",
      versionNumber: 1,
      legacyRuleId: "freeze-bishop-00000000000040008000000000000204@v1",
      contentHash: "hash",
    };
    invoke.mockResolvedValue({
      data: { success: true, data: publication },
      error: null,
    });

    await expect(
      publishRuleVersion({
        compilationId: "00000000-0000-4000-8000-000000000201",
        visibility: "unlisted",
      }),
    ).resolves.toEqual(publication);
  });

  it("preserves structured FunctionsHttpError recovery metadata", async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(
        new Response(
          JSON.stringify({
            success: false,
            code: "COMPILATION_REQUEST_EXPIRED",
            error: "Cette demande a expiré. Crée une nouvelle demande.",
            retryable: false,
            newRequestRequired: true,
          }),
          {
            status: 409,
            headers: {
              "content-type": "application/json",
            },
          },
        ),
      ),
    });

    const failure = await compileChessRule({
      prompt: "Une règle suffisamment détaillée et bornée.",
      premium: false,
      requestKey: "00000000-0000-4000-8000-000000000003",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RuleArchitectApiError);
    expect(failure).toMatchObject({
      message: "Cette demande a expiré. Crée une nouvelle demande.",
      code: "COMPILATION_REQUEST_EXPIRED",
      retryable: false,
      newRequestRequired: true,
      status: 409,
    });
  });

  it("turns a malformed compilation payload into a retryable error", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: {
          ...rejectedCompilation,
          metrics: undefined,
        },
      },
      error: null,
    });

    const failure = await compileChessRule({
      prompt: "Une règle suffisamment détaillée et bornée.",
      premium: false,
      requestKey: "00000000-0000-4000-8000-000000000005",
    }).catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(RuleArchitectApiError);
    expect(failure).toMatchObject({
      code: "INVALID_EDGE_RESPONSE",
      retryable: true,
      newRequestRequired: false,
    });
    expect((failure as Error).message).toContain("réponse invalide");
  });

  it("rejects malformed publication identifiers before exposing them to UI", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: {
          blueprintId: "not-a-uuid",
          versionId: "00000000-0000-4000-8000-000000000204",
          versionNumber: 1,
          legacyRuleId: "freeze-bishop-00000000000040008000000000000205@v1",
          contentHash: "hash",
        },
      },
      error: null,
    });

    await expect(
      publishRuleVersion({
        compilationId: "00000000-0000-4000-8000-000000000201",
        visibility: "unlisted",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_EDGE_RESPONSE",
      retryable: true,
    });
  });

  it("rejects an unsafe lobby seed from a malformed Edge response", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: {
          lobbyId: "00000000-0000-4000-8000-000000000206",
          rulesetHash: "hash",
          matchSeed: Number.MAX_SAFE_INTEGER + 1,
          legacyRuleIds: ["freeze-bishop-00000000000040008000000000000207@v1"],
        },
      },
      error: null,
    });

    await expect(
      createRuleLobby({
        name: "Lobby IA",
        mode: "ai",
        ruleVersionIds: ["00000000-0000-4000-8000-000000000204"],
        requestKey: "00000000-0000-4000-8000-000000000006",
      }),
    ).rejects.toMatchObject({
      code: "INVALID_EDGE_RESPONSE",
      retryable: true,
    });
  });
});
