import { describe, expect, it } from "vitest";
import {
  classifyMatchBootstrapFailure,
  truncateServerIdentity,
} from "../match-bootstrap";

describe("multiplayer match bootstrap errors", () => {
  it("distinguishes protected, missing and operational states", () => {
    expect(
      classifyMatchBootstrapFailure(
        new Error("Chargement a échoué (42501): MATCH_NOT_ACCESSIBLE"),
      ),
    ).toBe("forbidden");
    expect(classifyMatchBootstrapFailure(new Error("MATCH_NOT_FOUND"))).toBe(
      "not-found",
    );
    expect(classifyMatchBootstrapFailure(new Error("network timeout"))).toBe(
      "error",
    );
  });

  it("shows only bounded identity fragments", () => {
    expect(truncateServerIdentity("a".repeat(64))).toBe(
      `${"a".repeat(8)}…${"a".repeat(8)}`,
    );
  });
});
