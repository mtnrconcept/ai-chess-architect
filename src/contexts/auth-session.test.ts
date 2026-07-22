import { describe, expect, it, vi } from "vitest";
import { settleInitialAuthSession } from "./auth-session";

describe("settleInitialAuthSession", () => {
  it("leaves loading after getSession rejects", async () => {
    const apply = vi.fn();
    const onError = vi.fn();
    const failure = new Error("Session lookup failed");

    await settleInitialAuthSession({
      readSession: vi.fn().mockRejectedValue(failure),
      isMounted: () => true,
      apply,
      onError,
    });

    expect(onError).toHaveBeenCalledWith(failure);
    expect(apply).toHaveBeenCalledOnce();
    expect(apply).toHaveBeenCalledWith({
      session: null,
      user: null,
      loading: false,
    });
  });

  it("does not update state after the provider unmounts", async () => {
    const apply = vi.fn();

    await settleInitialAuthSession({
      readSession: vi.fn().mockRejectedValue(new Error("offline")),
      isMounted: () => false,
      apply,
    });

    expect(apply).not.toHaveBeenCalled();
  });
});
