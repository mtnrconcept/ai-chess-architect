import { assertEquals } from "jsr:@std/assert@1";
import { resolveStructuredResponseTimeout } from "./openai-responses.ts";

Deno.test("openai-responses: conserve le timeout par défaut", () => {
  assertEquals(resolveStructuredResponseTimeout(), 55_000);
});

Deno.test("openai-responses: applique le timeout de guidage borné", () => {
  assertEquals(resolveStructuredResponseTimeout(85_000), 85_000);
});

Deno.test("openai-responses: normalise les timeouts hors limites", () => {
  assertEquals(resolveStructuredResponseTimeout(1), 10_000);
  assertEquals(resolveStructuredResponseTimeout(150_000), 90_000);
  assertEquals(resolveStructuredResponseTimeout(85_000.9), 85_000);
  assertEquals(resolveStructuredResponseTimeout(Number.NaN), 55_000);
  assertEquals(
    resolveStructuredResponseTimeout(Number.POSITIVE_INFINITY),
    55_000,
  );
  assertEquals(
    resolveStructuredResponseTimeout(Number.NEGATIVE_INFINITY),
    55_000,
  );
});
