import { describe, expect, it } from "vitest";

import { parseRuleLobbyInvite } from "./invite";

const lobbyId = "907500fe-e417-42d7-9d82-514e4ed9dd30";

describe("rule lobby invitation parser", () => {
  it("accepts a lobby UUID", () => {
    expect(parseRuleLobbyInvite(lobbyId)).toBe(lobbyId);
  });

  it("extracts the lobby id from an invite URL", () => {
    expect(
      parseRuleLobbyInvite(
        `https://voltus.example/rule-lobby?source=friend&lobbyId=${lobbyId}`,
      ),
    ).toBe(lobbyId);
  });

  it("rejects incomplete and unrelated invitations", () => {
    expect(parseRuleLobbyInvite("907500fe-e417")).toBeNull();
    expect(
      parseRuleLobbyInvite("https://voltus.example/rule-lobby"),
    ).toBeNull();
  });
});
