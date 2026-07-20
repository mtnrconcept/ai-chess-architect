import { describe, expect, it, vi } from "vitest";
import {
  ProcessChessMoveError,
  isStrictMatchUuid,
  processChessMove,
  type ProcessMoveFunctionsClient,
} from "../move-api";
import { MATCH_ID } from "./fixtures";

const CLIENT_COMMAND_ID = "99999999-9999-4999-8999-999999999999";
const COMMAND_ID = "88888888-8888-4888-8888-888888888888";

const clientWith = (result: {
  data: unknown;
  error: unknown;
}): ProcessMoveFunctionsClient => ({
  functions: { invoke: vi.fn().mockResolvedValue(result) },
});

describe("process-chess-move client", () => {
  it("sends the strict Edge contract and accepts no local projection payload", async () => {
    const client = clientWith({
      data: {
        success: true,
        data: {
          commandId: COMMAND_ID,
          commandStatus: "accepted",
          matchId: MATCH_ID,
          revision: 3,
          alreadyProcessed: false,
          move: { fenAfter: "ignored-canonical-event-only" },
        },
      },
      error: null,
    });

    await expect(
      processChessMove(client, {
        matchId: MATCH_ID,
        expectedRevision: 2,
        clientCommandId: CLIENT_COMMAND_ID,
        uci: "e2e4",
      }),
    ).resolves.toEqual({
      commandId: COMMAND_ID,
      commandStatus: "accepted",
      matchId: MATCH_ID,
      revision: 3,
      alreadyProcessed: false,
    });
    expect(client.functions.invoke).toHaveBeenCalledWith("process-chess-move", {
      body: {
        matchId: MATCH_ID,
        expectedRevision: 2,
        clientCommandId: CLIENT_COMMAND_ID,
        uci: "e2e4",
      },
    });
  });

  it("surfaces the custom-rules fail-closed code from an HTTP error", async () => {
    const response = new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE",
          message: "Validateur indisponible.",
        },
      }),
      { status: 422 },
    );
    const client = clientWith({
      data: null,
      error: { message: "Edge returned 422", context: response },
    });

    await expect(
      processChessMove(client, {
        matchId: MATCH_ID,
        expectedRevision: 0,
        clientCommandId: CLIENT_COMMAND_ID,
        uci: "a7a8q",
      }),
    ).rejects.toMatchObject({
      code: "CUSTOM_RULES_VALIDATOR_NOT_AVAILABLE",
      status: 422,
    });
  });

  it("rejects malformed IDs and UCI before invoking the network", async () => {
    const client = clientWith({ data: null, error: null });

    await expect(
      processChessMove(client, {
        matchId: "not-a-match",
        expectedRevision: 0,
        clientCommandId: CLIENT_COMMAND_ID,
        uci: "e2e9",
      }),
    ).rejects.toBeInstanceOf(ProcessChessMoveError);
    expect(client.functions.invoke).not.toHaveBeenCalled();
    expect(isStrictMatchUuid(MATCH_ID)).toBe(true);
    expect(isStrictMatchUuid("../admin")).toBe(false);
  });

  it("rejects a success response bound to another match", async () => {
    const client = clientWith({
      data: {
        success: true,
        data: {
          commandId: COMMAND_ID,
          commandStatus: "accepted",
          matchId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
          revision: 1,
          alreadyProcessed: false,
        },
      },
      error: null,
    });

    await expect(
      processChessMove(client, {
        matchId: MATCH_ID,
        expectedRevision: 0,
        clientCommandId: CLIENT_COMMAND_ID,
        uci: "e2e4",
      }),
    ).rejects.toMatchObject({ code: "MATCH_STATE_INTEGRITY_FAILED" });
  });
});
