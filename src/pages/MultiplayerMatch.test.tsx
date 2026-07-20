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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { MultiplayerMatch } from "./MultiplayerMatch";

const renderPage = (location: string): string =>
  renderToStaticMarkup(
    createElement(
      QueryClientProvider,
      { client: new QueryClient() },
      createElement(
        StaticRouter,
        { location },
        createElement(MultiplayerMatch),
      ),
    ),
  );

describe("MultiplayerMatch protected bootstrap", () => {
  beforeEach(() => {
    authState.value = { user: null, loading: false };
  });

  it("requires authentication before loading a protected snapshot", () => {
    const markup = renderPage("/match/11111111-1111-4111-8111-111111111111");

    expect(markup).toContain("Connexion requise");
    expect(markup).toContain("snapshot protégé");
  });

  it("rejects a malformed match route before any server fallback", () => {
    authState.value = {
      user: { id: "66666666-6666-4666-8666-666666666666" },
      loading: false,
    };
    const markup = renderPage("/match/not-a-uuid");

    expect(markup).toContain("Lien de match invalide");
    expect(markup).toContain("Aucun appel serveur");
  });
});
