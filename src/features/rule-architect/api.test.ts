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

  it("prepares declared scene assets without accepting arbitrary URLs", async () => {
    invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            compilationId: "00000000-0000-4000-8000-000000000111",
            ok: true,
            compiledRule: {
              logic: {
                effects: [
                  {
                    do: [
                      {
                        action: "vfx.play",
                        params: { sprite: "scene.dragon-carry-capture" },
                      },
                      {
                        action: "vfx.play",
                        params: { sprite: "https://attacker.invalid/a.svg" },
                      },
                    ],
                  },
                ],
              },
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: { requested: 1, resolved: 1, fallback: 0 },
        },
        error: null,
      });

    await compileChessRule({
      prompt: "Un dragon emporte chaque pièce capturée.",
      premium: true,
      requestKey: "00000000-0000-4000-8000-000000000004",
    });

    expect(invoke).toHaveBeenNthCalledWith(2, "resolve-rule-assets", {
      body: {
        action: "resolve",
        compilationId: "00000000-0000-4000-8000-000000000111",
      },
    });
  });

  it("keeps a valid rule usable when external asset preparation fails", async () => {
    invoke
      .mockResolvedValueOnce({
        data: {
          success: true,
          data: {
            compilationId: "00000000-0000-4000-8000-000000000112",
            ok: true,
            compiledRule: {
              logic: {
                effects: [
                  {
                    do: {
                      action: "vfx.play",
                      params: { sprite: "scene.phoenix-rebirth" },
                    },
                  },
                ],
              },
            },
          },
        },
        error: null,
      })
      .mockResolvedValueOnce({
        data: null,
        error: new Error("provider unavailable"),
      });

    const result = await compileChessRule({
      prompt: "Un phénix renaît lorsqu'une tour est capturée.",
      premium: false,
      requestKey: "00000000-0000-4000-8000-000000000005",
    });

    expect(result.ok).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(2);
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
