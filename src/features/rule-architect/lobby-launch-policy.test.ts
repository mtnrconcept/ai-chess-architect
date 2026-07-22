import { describe, expect, it } from "vitest";
import { getRuleLobbyLaunchBlockReason } from "./lobby-launch-policy";

describe("Rule Lobby launch policy", () => {
  it("fails closed for player lobbies until the authoritative runtime exists", () => {
    expect(getRuleLobbyLaunchBlockReason("player")).toContain(
      "runtime serveur autoritaire",
    );
  });

  it("allows the existing authoritative AI runtime", () => {
    expect(getRuleLobbyLaunchBlockReason("ai")).toBeNull();
  });
});
