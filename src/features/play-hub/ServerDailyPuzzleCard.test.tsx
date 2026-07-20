import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("./platform-api", () => ({
  submitServerDailyPuzzle: vi.fn(),
}));

import { ServerDailyPuzzleCard } from "./ServerDailyPuzzleCard";
import type { ServerDailyPuzzle } from "./platform-api";

const basePuzzle: ServerDailyPuzzle = {
  available: true,
  puzzleId: "c4000000-0000-4000-8000-000000000001",
  puzzleDate: "2026-07-20",
  title: "Le mat silencieux",
  fen: "7k/5Q2/6K1/8/8/8/8/8 w - - 0 1",
  themes: ["mateIn1"],
  rating: 800,
  attemptStatus: null,
  attemptCount: 0,
};

describe("ServerDailyPuzzleCard states", () => {
  it("renders a generic from/to board without displaying candidate answers", () => {
    const markup = renderToStaticMarkup(
      createElement(ServerDailyPuzzleCard, {
        puzzle: basePuzzle,
        onServerStateChanged: vi.fn(),
      }),
    );

    expect(markup).toContain("Puzzle officiel · serveur");
    expect(markup).toContain("Sélectionne d’abord la case de départ");
    expect(markup).toContain("aucune liste de réponses");
    expect(markup).toContain("vérifiée exclusivement côté serveur");
    expect(markup).not.toContain(["correct", "Move"].join(""));
    expect(markup).not.toContain("solution_moves");
  });

  it("fails closed when the server FEN is invalid", () => {
    const markup = renderToStaticMarkup(
      createElement(ServerDailyPuzzleCard, {
        puzzle: {
          ...basePuzzle,
          fen: "8/8/8/8/8/8/8/8 w - - 0 1",
        },
        onServerStateChanged: vi.fn(),
      }),
    );

    expect(markup).toContain("Position invalide");
    expect(markup).toContain("fail-closed");
    expect(markup).not.toContain("Joue ton coup");
  });

  it("ships no curated server solution table or known UCI answer", () => {
    const source = ["daily-puzzles.ts", "ServerDailyPuzzleCard.tsx"]
      .map((file) =>
        readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8"),
      )
      .join("\n");

    expect(source).not.toContain(["serverPuzzleChoices", "ByFen"].join(""));
    expect(source).not.toContain(["f7", "f8"].join(""));
  });
});
