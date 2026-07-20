import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StaticRouter } from "react-router-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const authState = vi.hoisted(() => ({
  value: {
    user: null as { id: string } | null,
    loading: false,
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState.value,
}));

vi.mock("@/features/play-hub/platform-api", () => ({
  getChessLeaderboard: vi.fn(),
  neutralPlayerLabel: (userId: string) => {
    const compact = userId.replace(/-/g, "").toUpperCase();
    return `Joueur ${compact.slice(0, 4)}-${compact.slice(-4)}`;
  },
}));

import Leaderboard from "./Leaderboard";

const userId = "907500fe-e417-42d7-9d82-514e4ed9dd30";

const renderLeaderboard = (queryClient = new QueryClient()): string =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: queryClient },
      createElement(
        StaticRouter,
        { location: "/leaderboard" },
        createElement(Leaderboard),
      ),
    ),
  );

describe("Leaderboard server states", () => {
  beforeEach(() => {
    authState.value = { user: null, loading: false };
  });

  it("requires authentication without rendering fictional players", () => {
    const markup = renderLeaderboard();

    expect(markup).toContain("Connexion requise");
    expect(markup).not.toContain("Freumeier");
    expect(markup).not.toContain("Majorane");
  });

  it("renders the honest empty season state from cached server data", () => {
    authState.value = { user: { id: userId }, loading: false };
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["chess-platform", "leaderboard", "current-season"],
      [],
    );

    const markup = renderLeaderboard(queryClient);

    expect(markup).toContain("Aucun joueur classé");
    expect(markup).toContain("Aucune saison active");
  });

  it("renders a neutral alias instead of the complete user UUID", () => {
    authState.value = { user: { id: userId }, loading: false };
    const queryClient = new QueryClient();
    queryClient.setQueryData(
      ["chess-platform", "leaderboard", "current-season"],
      [
        {
          rank: 1,
          userId,
          rating: 1200,
          gamesPlayed: 1,
          wins: 1,
          draws: 0,
          losses: 0,
          provisional: true,
        },
      ],
    );

    const markup = renderLeaderboard(queryClient);

    expect(markup).toContain("Joueur 9075-DD30");
    expect(markup).not.toContain(userId);
    expect(markup).toContain("Vous");
  });
});
