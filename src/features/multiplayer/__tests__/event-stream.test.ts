import { describe, expect, it } from "vitest";
import { MatchEventConflictError, MatchEventStream } from "../event-stream";
import { normalizeMatchIdentity } from "../identity";
import {
  asAnyEvent,
  clock,
  event,
  HASH,
  identity,
  participants,
} from "./fixtures";

const started = (sequence: number, eventId?: string) =>
  asAnyEvent(
    event(
      sequence,
      "match.started",
      {
        participants,
        currentSide: "white",
        clock: clock(),
        initialPositionHash: "initial",
      },
      eventId,
    ),
  );

describe("MatchEventStream", () => {
  it("buffers out-of-order Realtime events and releases contiguous history", () => {
    const stream = new MatchEventStream(identity);
    expect(stream.ingest(started(2)).ready).toEqual([]);
    const result = stream.ingest(
      asAnyEvent(event(1, "match.waiting", { participants, clock: null })),
    );
    expect(result.ready.map((item) => item.sequence)).toEqual([1, 2]);
    expect(result.missingSequence).toBeNull();
  });

  it("deduplicates history/Realtime overlap", () => {
    const stream = new MatchEventStream(identity);
    const first = asAnyEvent(
      event(1, "match.waiting", { participants, clock: null }),
    );
    expect(stream.ingest(first).ready).toHaveLength(1);
    const duplicate = stream.ingest(first);
    expect(duplicate.ready).toEqual([]);
    expect(duplicate.duplicateCount).toBe(1);
  });

  it("rejects two event IDs claiming the same sequence", () => {
    const stream = new MatchEventStream(identity);
    stream.ingest(started(2, "event-a"));
    expect(() => stream.ingest(started(2, "event-b"))).toThrow(
      MatchEventConflictError,
    );
  });

  it("rejects a duplicate event id whose canonical payload changed", () => {
    const stream = new MatchEventStream(identity);
    const first = asAnyEvent(
      event(1, "match.waiting", { participants, clock: null }, "stable-id"),
    );
    stream.ingest(first);
    expect(() =>
      stream.ingest({
        ...first,
        occurredAt: new Date(
          Date.parse(first.occurredAt) + 1_000,
        ).toISOString(),
      }),
    ).toThrow("changé");
  });

  it("rejects an event from another ruleset", () => {
    const stream = new MatchEventStream(identity);
    const incompatible = started(1);
    incompatible.identity = normalizeMatchIdentity({
      ...identity,
      rulesetHash: HASH.replace(/^a/, "b"),
    });
    expect(() => stream.ingest(incompatible)).toThrow("incompatibles");
  });
});
