import { describe, expect, it } from "vitest";
import { inferPieceMaterial, PIECE_MATERIALS } from "./piece-art";

describe("free procedural chess piece art", () => {
  it.each([
    ["Un pion crée un piège de sables mouvants", "sand"],
    ["Les rois sont recouverts de glace", "ice"],
    ["Une tour lance une boule de feu", "flame"],
    ["La forêt magique protège les fous", "forest"],
    ["Des fantômes apparaissent", "shadow"],
    ["Une reine lance des éclairs", "arcane"],
    ["Un cavalier est en armure d'acier", "steel"],
  ] as const)("chooses the %s material", (prompt, expected) => {
    expect(inferPieceMaterial(prompt)).toBe(expected);
  });

  it("keeps standard chess visuals when no supported art cue exists", () => {
    expect(inferPieceMaterial("Les pions avancent de deux cases")).toBeNull();
    expect(inferPieceMaterial(null)).toBeNull();
    expect(new Set(PIECE_MATERIALS).size).toBe(PIECE_MATERIALS.length);
  });

  it("never derives executable assets from untrusted prompt strings", () => {
    expect(inferPieceMaterial('javascript:alert(1);<script>alert(1)</script>')).toBeNull();
    expect(inferPieceMaterial("La reine dans les dunes")).toBe("sand");
  });
});
