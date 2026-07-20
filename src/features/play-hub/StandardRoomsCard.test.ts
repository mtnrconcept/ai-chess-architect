import { describe, expect, it } from "vitest";

import { buildStandardRoomInviteUrl } from "./standard-room-invite";

const roomId = "55000000-0000-4000-8000-000000000005";
const token = "b".repeat(64);

describe("standard room invitation links", () => {
  it("puts the one-time token only in the private URL", () => {
    const invite = new URL(
      buildStandardRoomInviteUrl("https://chess.example", roomId, token),
    );

    expect(invite.origin).toBe("https://chess.example");
    expect(invite.pathname).toBe("/play-hub");
    expect(invite.searchParams.get("roomId")).toBe(roomId);
    expect(invite.searchParams.get("token")).toBe(token);
  });

  it("fails closed for malformed room ids or tokens", () => {
    expect(() =>
      buildStandardRoomInviteUrl("https://chess.example", "room", token),
    ).toThrow(/invalide/);
    expect(() =>
      buildStandardRoomInviteUrl("https://chess.example", roomId, "secret"),
    ).toThrow(/invalide/);
  });
});
