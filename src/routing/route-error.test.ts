import { describe, expect, it } from "vitest";
import { describeRouteError } from "./route-error";

describe("describeRouteError", () => {
  it("keeps an actionable application error message", () => {
    expect(describeRouteError(new Error("Le chargement a échoué."))).toBe(
      "Le chargement a échoué.",
    );
  });

  it("uses a safe fallback for unknown thrown values", () => {
    expect(describeRouteError({ unexpected: true })).toBe(
      "La page n’a pas pu être affichée.",
    );
  });
});
