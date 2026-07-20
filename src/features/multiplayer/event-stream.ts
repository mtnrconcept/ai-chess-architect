import type { AnyPersistedMatchEvent, MatchIdentity } from "./contracts";
import { assertCompatibleMatchIdentity } from "./identity";

export class MatchEventConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchEventConflictError";
  }
}

export interface EventIngestResult {
  ready: AnyPersistedMatchEvent[];
  duplicateCount: number;
  bufferedCount: number;
  missingSequence: number | null;
}

const canonicalize = (value: unknown): string => {
  if (value === undefined) return "undefined";
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalize).join(",")}]`;
  }
  const entries = Object.entries(value as Record<string, unknown>).sort(
    ([left], [right]) => left.localeCompare(right),
  );
  return `{${entries
    .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`)
    .join(",")}}`;
};

/**
 * Orders events from history and Realtime, buffers gaps, and deduplicates the
 * normal overlap produced by a subscribe-before-replay recovery strategy.
 */
export class MatchEventStream {
  private cursor: number;
  private readonly buffer = new Map<number, AnyPersistedMatchEvent>();
  private readonly bufferedEventSequences = new Map<string, number>();
  private readonly seenEventFingerprints = new Map<string, string>();

  constructor(
    private readonly identity: MatchIdentity,
    initialSequence = 0,
    private readonly maxBufferedEvents = 2_048,
  ) {
    if (!Number.isSafeInteger(initialSequence) || initialSequence < 0) {
      throw new Error("La séquence initiale est invalide.");
    }
    this.cursor = initialSequence;
  }

  get lastSequence(): number {
    return this.cursor;
  }

  get bufferedCount(): number {
    return this.buffer.size;
  }

  get missingSequence(): number | null {
    if (this.buffer.size === 0) return null;
    return this.buffer.has(this.cursor + 1) ? null : this.cursor + 1;
  }

  reset(sequence: number): void {
    if (!Number.isSafeInteger(sequence) || sequence < 0) {
      throw new Error("La séquence de reprise est invalide.");
    }
    this.cursor = sequence;
    this.buffer.clear();
    this.bufferedEventSequences.clear();
    this.seenEventFingerprints.clear();
  }

  ingest(
    incoming: AnyPersistedMatchEvent | readonly AnyPersistedMatchEvent[],
  ): EventIngestResult {
    const events = Array.isArray(incoming) ? incoming : [incoming];
    let duplicateCount = 0;

    for (const event of events) {
      assertCompatibleMatchIdentity(this.identity, event.identity);
      if (event.sequence !== event.revision + 1) {
        throw new MatchEventConflictError(
          `L'événement ${event.eventId} a une révision incohérente.`,
        );
      }
      const fingerprint = canonicalize(event);
      const seenFingerprint = this.seenEventFingerprints.get(event.eventId);
      if (seenFingerprint !== undefined) {
        if (seenFingerprint !== fingerprint) {
          throw new MatchEventConflictError(
            `L'événement ${event.eventId} a changé après application.`,
          );
        }
        duplicateCount += 1;
        continue;
      }

      if (event.sequence <= this.cursor) {
        duplicateCount += 1;
        continue;
      }

      const eventSequence = this.bufferedEventSequences.get(event.eventId);
      if (eventSequence !== undefined) {
        if (eventSequence !== event.sequence) {
          throw new MatchEventConflictError(
            `L'événement ${event.eventId} porte deux séquences différentes.`,
          );
        }
        const buffered = this.buffer.get(event.sequence);
        if (buffered && canonicalize(buffered) !== fingerprint) {
          throw new MatchEventConflictError(
            `L'événement ${event.eventId} a deux contenus différents.`,
          );
        }
        duplicateCount += 1;
        continue;
      }

      const existing = this.buffer.get(event.sequence);
      if (existing) {
        if (existing.eventId !== event.eventId) {
          throw new MatchEventConflictError(
            `Deux événements différents revendiquent la séquence ${event.sequence}.`,
          );
        }
        duplicateCount += 1;
        continue;
      }

      if (this.buffer.size >= this.maxBufferedEvents) {
        throw new MatchEventConflictError(
          "Trop d'événements en attente: reprise complète requise.",
        );
      }
      this.buffer.set(event.sequence, event);
      this.bufferedEventSequences.set(event.eventId, event.sequence);
    }

    const ready: AnyPersistedMatchEvent[] = [];
    while (true) {
      const next = this.buffer.get(this.cursor + 1);
      if (!next) break;
      this.buffer.delete(next.sequence);
      this.bufferedEventSequences.delete(next.eventId);
      this.seenEventFingerprints.set(next.eventId, canonicalize(next));
      this.cursor = next.sequence;
      ready.push(next);
    }

    return {
      ready,
      duplicateCount,
      bufferedCount: this.buffer.size,
      missingSequence: this.missingSequence,
    };
  }
}
