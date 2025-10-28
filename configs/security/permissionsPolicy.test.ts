import { describe, expect, it } from "vitest";
import {
  blockedPermissionsPolicyDirectives,
  buildPermissionsPolicyHeader,
  defaultPermissionsPolicyDirectives,
  defaultPermissionsPolicyHeader,
} from "./permissionsPolicy";

describe("buildPermissionsPolicyHeader", () => {
  it("serialises directives while trimming and deduplicating allow lists", () => {
    const header = buildPermissionsPolicyHeader({
      camera: [],
      fullscreen: [" self ", "self", "https://example.com"],
      autoplay: ["https://example.com", "https://example.com"],
    });

    expect(header).toBe(
      "camera=(), fullscreen=(self https://example.com), autoplay=(https://example.com)",
    );
  });

  it("throws when an unsupported directive is provided", () => {
    for (const directive of blockedPermissionsPolicyDirectives) {
      expect(() =>
        buildPermissionsPolicyHeader({ [directive]: [] }),
      ).toThrowError(new RegExp(directive));
    }
  });
});

describe("defaultPermissionsPolicyHeader", () => {
  it("does not reference deprecated directives", () => {
    for (const directive of blockedPermissionsPolicyDirectives) {
      expect(defaultPermissionsPolicyHeader).not.toContain(directive);
    }
  });

  it("stays in sync with the default directives map", () => {
    expect(defaultPermissionsPolicyHeader).toBe(
      buildPermissionsPolicyHeader(defaultPermissionsPolicyDirectives),
    );
  });
});
