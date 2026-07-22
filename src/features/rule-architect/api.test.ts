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
  RuleArchitectApiError,
} from "./api";

describe("Rule Architect API idempotency contract", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("forwards the stable request key when compiling", async () => {
    invoke.mockResolvedValue({
      data: {
        success: true,
        data: { compilationId: "compilation" },
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
        data: { compilationId: "compilation" },
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
          lobbyId: "lobby",
          rulesetHash: "hash",
          matchSeed: null,
          legacyRuleIds: [],
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
});
