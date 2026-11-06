import { describe, expect, it } from "vitest";
import {
  normalizeFxCell,
  resolveFxColor,
  sanitizeFxRadius,
  sanitizeFxDuration,
  isSupportedFxIntent,
} from "./fx-policy";

describe("custom chess effects safety and quality", () => {
  it("positions FX only on canonical board squares", () => {
    expect(normalizeFxCell("e4")).toBe("e4");
    expect(normalizeFxCell("a1")).toBe("a1");
    expect(normalizeFxCell("h8")).toBe("h8");
    for (const malformed of [
      "a0",
      "i4",
      "a9",
      "../../config",
      "a1<script>",
      "",
      "A1",
    ]) {
      expect(normalizeFxCell(malformed)).toBeNull();
    }
    expect(normalizeFxCell({ cell: "e4" })).toBeNull();
  });

  it("parses only safe six-digit hex colors and respects fallback", () => {
    expect(resolveFxColor("#00aaff", 0xff0000)).toBe(0x00aaff);
    expect(resolveFxColor("#FF8800", 0)).toBe(0xff8800);
    expect(resolveFxColor("red", 0x123456)).toBe(0x123456);
    expect(resolveFxColor("#ffffffff", 0x123456)).toBe(0x123456);
    expect(resolveFxColor("javascript:alert(1)", 0x123456)).toBe(0x123456);
    expect(resolveFxColor(1234, 0x123456)).toBe(0x123456);
  });

  it("bounds generated area radii and animation durations", () => {
    expect(sanitizeFxRadius(2)).toBe(2);
    expect(sanitizeFxRadius(99)).toBe(3);
    expect(sanitizeFxRadius(-10)).toBe(0.5);
    expect(sanitizeFxRadius(Number.NaN)).toBe(1);
    expect(sanitizeFxDuration(0.65)).toBe(0.65);
    expect(sanitizeFxDuration(100)).toBe(2);
    expect(sanitizeFxDuration(-1)).toBe(0.15);
    expect(sanitizeFxDuration(Infinity)).toBe(0.8);
  });

  it("renders every declared combat, scan and movement VFX intent", () => {
    const allowed = [
      "object.spawn",
      "area.hazard",
      "combat.explosion",
      "combat.hit",
      "combat.freeze",
      "combat.burn",
      "space.warp",
      "viz.hologram",
      "viz.scan",
      "viz.highlight",
      "piece.trail",
    ];
    for (const intent of allowed)
      expect(isSupportedFxIntent(intent)).toBe(true);
    expect(isSupportedFxIntent("code.execute")).toBe(false);
    expect(isSupportedFxIntent("url.load")).toBe(false);
  });
});
