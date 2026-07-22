import { assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { preflightIfOptions } from "./cors.ts";

const preflight = (origin: string, requestedHeaders = "authorization") => {
  const response = preflightIfOptions(
    new Request("https://example.test/functions/v1/chess-insights", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-headers": requestedHeaders,
      },
    }),
  );
  if (!response) throw new Error("PREFLIGHT_RESPONSE_MISSING");
  return response.headers;
};

Deno.test("cors legacy: autorise la production Vercel canonique", () => {
  const origin = "https://ai-chess-architect.vercel.app";
  assertEquals(preflight(origin).get("access-control-allow-origin"), origin);
});

Deno.test(
  "cors legacy: autorise uniquement les previews Vercel du projet",
  () => {
    const projectPreview =
      "https://ai-chess-architect-git-fix-runtime-mtnrconcepts-projects.vercel.app";
    const unrelatedPreview =
      "https://unrelated-git-fix-runtime-mtnrconcepts-projects.vercel.app";

    assertEquals(
      preflight(projectPreview).get("access-control-allow-origin"),
      projectPreview,
    );
    assertNotEquals(
      preflight(unrelatedPreview).get("access-control-allow-origin"),
      unrelatedPreview,
    );
  },
);

Deno.test("cors legacy: n'autorise pas un en-tête arbitraire demandé", () => {
  const allowedHeaders =
    preflight(
      "https://ai-chess-architect.vercel.app",
      "authorization, x-attacker-controlled",
    ).get("access-control-allow-headers") ?? "";

  assertEquals(allowedHeaders.toLowerCase().includes("authorization"), true);
  assertEquals(
    allowedHeaders.toLowerCase().includes("x-attacker-controlled"),
    false,
  );
});
