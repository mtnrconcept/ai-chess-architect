import { describe, expect, it } from "vitest";
import {
  assertCompatibleMatchIdentity,
  canonicalMatchSeed,
  MatchIdentityError,
  normalizeMatchIdentity,
} from "../identity";
import { matchIdentityFromRuleArchitectRuntime } from "../rule-architect-bridge";
import { HASH, LOBBY_ID, MATCH_ID, identity } from "./fixtures";

describe("multiplayer match identity", () => {
  it("canonicalizes a Postgres bigint seed without losing precision", () => {
    expect(canonicalMatchSeed("0001948897573444275")).toBe("1948897573444275");
    expect(canonicalMatchSeed(42n)).toBe("42");
  });

  it("rejects unsafe JavaScript numbers and out-of-range bigints", () => {
    expect(() => canonicalMatchSeed(Number.MAX_SAFE_INTEGER + 1)).toThrow(
      MatchIdentityError,
    );
    expect(() => canonicalMatchSeed("9223372036854775808")).toThrow("Postgres");
  });

  it("fails closed when rulesetHash differs", () => {
    const incompatible = normalizeMatchIdentity({
      ...identity,
      rulesetHash: "b".repeat(64),
    });
    expect(() => assertCompatibleMatchIdentity(identity, incompatible)).toThrow(
      "incompatibles",
    );
  });

  it("maps a Rule Architect V2 runtime without changing hash or seed", () => {
    expect(
      matchIdentityFromRuleArchitectRuntime(
        {
          lobbyId: LOBBY_ID,
          rulesetHash: HASH,
          matchSeed: 1_948_897_573_444_275,
          engineVersion: "2.0.0",
          status: "matched",
        },
        MATCH_ID,
      ),
    ).toEqual(identity);
  });
});
