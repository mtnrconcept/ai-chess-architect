import { beforeEach, describe, expect, it, vi } from "vitest";
import { FunctionsHttpError } from "@supabase/supabase-js";

const invoke = vi.hoisted(() => vi.fn());
const createRequestKey = vi.hoisted(() => vi.fn());

const reactHarness = vi.hoisted(() => {
  type StateSlot = {
    kind: "state";
    value: unknown;
  };
  type RefSlot = {
    kind: "ref";
    value: { current: unknown };
  };
  type Slot = StateSlot | RefSlot;

  const slots = new Map<number, Slot>();
  let cursor = 0;

  const nextIndex = (): number => {
    const index = cursor;
    cursor += 1;
    return index;
  };

  function useState<T>(
    initial: T | (() => T),
  ): [T, (next: T | ((previous: T) => T)) => void] {
    const index = nextIndex();
    let slot = slots.get(index);
    if (!slot) {
      slot = {
        kind: "state",
        value: typeof initial === "function" ? (initial as () => T)() : initial,
      };
      slots.set(index, slot);
    }
    if (slot.kind !== "state") {
      throw new Error("Ordre des hooks incohérent.");
    }

    const stateSlot = slot;
    const setState = (next: T | ((previous: T) => T)) => {
      stateSlot.value =
        typeof next === "function"
          ? (next as (previous: T) => T)(stateSlot.value as T)
          : next;
    };

    return [stateSlot.value as T, setState];
  }

  function useRef<T>(initial: T): { current: T } {
    const index = nextIndex();
    let slot = slots.get(index);
    if (!slot) {
      slot = {
        kind: "ref",
        value: { current: initial },
      };
      slots.set(index, slot);
    }
    if (slot.kind !== "ref") {
      throw new Error("Ordre des hooks incohérent.");
    }
    return slot.value as { current: T };
  }

  function useCallback<T>(callback: T): T {
    nextIndex();
    return callback;
  }

  return {
    beginRender: () => {
      cursor = 0;
    },
    reset: () => {
      slots.clear();
      cursor = 0;
    },
    useState,
    useRef,
    useCallback,
  };
});

vi.mock("react", () => ({
  useState: reactHarness.useState,
  useRef: reactHarness.useRef,
  useCallback: reactHarness.useCallback,
}));

vi.mock("@/integrations/supabase/client", () => ({
  requireSupabaseClient: () => ({
    functions: { invoke },
  }),
}));

vi.mock("./request-key", () => ({
  createRequestKey,
}));

import { useRuleArchitect } from "./useRuleArchitect";

const prompt = "Une règle suffisamment détaillée, déterministe et bornée.";

const successfulCompilation = {
  data: {
    success: true,
    data: {
      compilationId: "compilation-id",
      ok: true,
    },
  },
  error: null,
};

const RuleArchitectHookHarness = (): ReturnType<typeof useRuleArchitect> => {
  reactHarness.beginRender();
  return useRuleArchitect();
};

describe("useRuleArchitect compilation recovery", () => {
  beforeEach(() => {
    reactHarness.reset();
    invoke.mockReset();
    createRequestKey.mockReset();
    createRequestKey
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000101")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000102");
  });

  it("reuses the same request key after an ambiguous network failure", async () => {
    invoke
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Connexion interrompue."),
      })
      .mockResolvedValueOnce(successfulCompilation);

    let architect = RuleArchitectHookHarness();
    await expect(architect.compile(prompt, false)).rejects.toThrow(
      "Connexion interrompue.",
    );

    architect = RuleArchitectHookHarness();
    expect(architect.compileFailure).toMatchObject({
      newRequestRequired: false,
    });

    await architect.compile(prompt, false);

    expect(createRequestKey).toHaveBeenCalledTimes(1);
    expect(invoke).toHaveBeenNthCalledWith(1, "compile-chess-rule", {
      body: {
        prompt,
        premium: false,
        requestKey: "00000000-0000-4000-8000-000000000101",
      },
    });
    expect(invoke).toHaveBeenNthCalledWith(2, "compile-chess-rule", {
      body: {
        prompt,
        premium: false,
        requestKey: "00000000-0000-4000-8000-000000000101",
      },
    });
  });

  it("discards the request key only when the server requires a new request", async () => {
    invoke
      .mockResolvedValueOnce({
        data: null,
        error: new FunctionsHttpError(
          new Response(
            JSON.stringify({
              success: false,
              code: "COMPILATION_REQUEST_EXPIRED",
              error: "Cette demande a expiré.",
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
      })
      .mockResolvedValueOnce(successfulCompilation);

    let architect = RuleArchitectHookHarness();
    await expect(architect.compile(prompt, false)).rejects.toThrow(
      "Cette demande a expiré.",
    );

    architect = RuleArchitectHookHarness();
    expect(architect.compileFailure).toMatchObject({
      code: "COMPILATION_REQUEST_EXPIRED",
      newRequestRequired: true,
    });

    await architect.compile(prompt, false);

    expect(createRequestKey).toHaveBeenCalledTimes(2);
    expect(invoke).toHaveBeenNthCalledWith(2, "compile-chess-rule", {
      body: {
        prompt,
        premium: false,
        requestKey: "00000000-0000-4000-8000-000000000102",
      },
    });
  });

  it("creates no replacement key until an explicit reset is followed by a retry", async () => {
    invoke
      .mockResolvedValueOnce({
        data: null,
        error: new Error("Réponse réseau inconnue."),
      })
      .mockResolvedValueOnce(successfulCompilation);

    let architect = RuleArchitectHookHarness();
    await expect(architect.compile(prompt, false)).rejects.toThrow(
      "Réponse réseau inconnue.",
    );

    architect = RuleArchitectHookHarness();
    architect.resetCompilation();
    expect(createRequestKey).toHaveBeenCalledTimes(1);

    architect = RuleArchitectHookHarness();
    expect(architect.phase).toBe("idle");
    expect(architect.compileFailure).toBeNull();

    await architect.compile(prompt, false);
    expect(createRequestKey).toHaveBeenCalledTimes(2);
  });
});
