import { describe, expect, it } from "vitest";
import { deriveClock, formatClock, ServerTimeEstimator } from "../clock";
import { PresenceLeaseTracker } from "../presence";
import { clock, T0 } from "./fixtures";

describe("server-anchored multiplayer clock", () => {
  it("derives remaining time from server timestamps without interval drift", () => {
    const derived = deriveClock(clock("white"), Date.parse(T0) + 1_500);
    expect(derived.whiteRemainingMs).toBe(298_500);
    expect(derived.blackRemainingMs).toBe(300_000);
    expect(formatClock(derived.whiteRemainingMs)).toBe("4:59");
  });

  it("freezes a paused clock", () => {
    const derived = deriveClock(
      clock("black", { pausedAt: T0, blackRemainingMs: 2_000 }),
      Date.parse(T0) + 60_000,
    );
    expect(derived.blackRemainingMs).toBe(2_000);
    expect(derived.timedOutSide).toBeNull();
  });

  it("detects timeout from the authoritative anchor", () => {
    const derived = deriveClock(
      clock("black", { blackRemainingMs: 1_000 }),
      Date.parse(T0) + 1_001,
    );
    expect(derived.blackRemainingMs).toBe(0);
    expect(derived.timedOutSide).toBe("black");
  });

  it("uses a median server offset to resist one latency outlier", () => {
    const estimator = new ServerTimeEstimator(5);
    estimator.observe({
      clientSentAtMs: 1_000,
      clientReceivedAtMs: 1_100,
      serverNow: new Date(1_250).toISOString(),
    });
    estimator.observe({
      clientSentAtMs: 2_000,
      clientReceivedAtMs: 2_100,
      serverNow: new Date(2_250).toISOString(),
    });
    estimator.observe({
      clientSentAtMs: 3_000,
      clientReceivedAtMs: 13_000,
      serverNow: new Date(3_250).toISOString(),
    });
    expect(estimator.offsetMs).toBe(200);
    expect(estimator.estimateServerNow(5_000)).toBe(5_200);
  });
});

describe("presence lease assessment", () => {
  it("distinguishes connected, reconnecting and abandonment candidate", () => {
    const tracker = new PresenceLeaseTracker({
      disconnectAfterMs: 10_000,
      abandonmentAfterMs: 30_000,
    });
    tracker.observe("opponent", T0);
    expect(tracker.assess("opponent", Date.parse(T0) + 9_999).state).toBe(
      "connected",
    );
    expect(tracker.assess("opponent", Date.parse(T0) + 10_000).state).toBe(
      "reconnecting",
    );
    expect(tracker.assess("opponent", Date.parse(T0) + 30_000).state).toBe(
      "abandonment_candidate",
    );
  });

  it("never adjudicates an unknown participant locally", () => {
    const tracker = new PresenceLeaseTracker();
    expect(tracker.assess("unknown", Date.parse(T0))).toMatchObject({
      state: "unknown",
      staleForMs: null,
    });
  });
});
