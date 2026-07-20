import { describe, expect, it } from "vitest";
import { createRequestKey } from "./request-key";

describe("createRequestKey", () => {
  it("creates unique RFC 4122 version 4 UUIDs", () => {
    const keys = Array.from({ length: 32 }, createRequestKey);

    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) {
      expect(key).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    }
  });
});
