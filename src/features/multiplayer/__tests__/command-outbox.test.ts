import { describe, expect, it } from "vitest";
import type { MatchCommand, MatchCommandReceipt } from "../contracts";
import {
  MatchCommandOutbox,
  MemoryCommandOutboxStorage,
} from "../command-outbox";
import { identity, T0 } from "./fixtures";

const command: MatchCommand = {
  type: "move",
  clientCommandId: "33333333-3333-4333-8333-333333333333",
  identity,
  expectedRevision: 0,
  uci: "e2e4",
  submittedClockMs: 299_000,
  createdAtClient: T0,
};

const acknowledgement = (): MatchCommandReceipt => ({
  commandId: "44444444-4444-4444-8444-444444444444",
  clientCommandId: command.clientCommandId,
  commandSequence: 1,
  status: "pending",
  authoritativeRevision: command.expectedRevision,
});

describe("MatchCommandOutbox", () => {
  it("keeps a move until the server confirms the same idempotency key", async () => {
    const storage = new MemoryCommandOutboxStorage();
    const outbox = new MatchCommandOutbox(identity, { storage });
    await outbox.enqueue(command);

    await expect(
      outbox.flush(async () => {
        throw new Error("offline");
      }),
    ).rejects.toThrow("offline");
    expect(outbox.pending).toHaveLength(1);

    const persisted = await outbox.flush(async () => acknowledgement());
    expect(persisted).toHaveLength(1);
    expect(outbox.pending).toHaveLength(0);
  });

  it("refuses speculative multiple moves in the default ranked capacity", async () => {
    const outbox = new MatchCommandOutbox(identity);
    await outbox.enqueue(command);
    await expect(
      outbox.enqueue({
        ...command,
        clientCommandId: "55555555-5555-4555-8555-555555555555",
      }),
    ).rejects.toThrow("spéculatif");
  });

  it("rejects an acknowledgement for another idempotency key", async () => {
    const outbox = new MatchCommandOutbox(identity);
    await outbox.enqueue(command);
    await expect(
      outbox.flush(async () => ({
        ...acknowledgement(),
        clientCommandId: "55555555-5555-4555-8555-555555555555",
      })),
    ).rejects.toThrow("idempotent");
    expect(outbox.pending).toHaveLength(1);
  });

  it("clears an idempotent retry already accepted at a later revision", async () => {
    const outbox = new MatchCommandOutbox(identity);
    await outbox.enqueue(command);
    const receipts = await outbox.flush(async () => ({
      ...acknowledgement(),
      status: "accepted",
      authoritativeRevision: command.expectedRevision + 1,
    }));
    expect(receipts[0].status).toBe("accepted");
    expect(outbox.pending).toHaveLength(0);
  });
});
