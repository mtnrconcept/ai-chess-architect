import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CompilationRecoveryActions } from "./CompilationRecoveryActions";

describe("CompilationRecoveryActions", () => {
  it("offers an idempotent retry and an explicit reset without a compilation", () => {
    const markup = renderToStaticMarkup(
      createElement(CompilationRecoveryActions, {
        message: "La réponse réseau est ambiguë.",
        newRequestRequired: false,
        onRetry: vi.fn(),
        onReset: vi.fn(),
      }),
    );

    expect(markup).toContain("Nouvelle tentative");
    expect(markup).toContain("Réinitialiser la demande");
    expect(markup).toContain("réutilisera la même clé");
  });

  it("requires an explicit reset for a terminal request key", () => {
    const markup = renderToStaticMarkup(
      createElement(CompilationRecoveryActions, {
        message: "La demande a expiré.",
        code: "COMPILATION_REQUEST_EXPIRED",
        newRequestRequired: true,
        onRetry: vi.fn(),
        onReset: vi.fn(),
      }),
    );

    expect(markup).not.toContain("Nouvelle tentative");
    expect(markup).toContain("Réinitialiser la tentative");
    expect(markup).toContain("COMPILATION_REQUEST_EXPIRED");
  });
});
