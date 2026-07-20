import {
  MoveProcessingError,
  parseProcessMoveRequest,
  parseUci,
  readBoundedJson,
} from "./protocol.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertCode(run: () => unknown, expected: string): void {
  try {
    run();
  } catch (error) {
    assert(
      error instanceof MoveProcessingError && error.code === expected,
      `Code attendu: ${expected}`,
    );
    return;
  }
  throw new Error(`Une erreur ${expected} était attendue.`);
}

const validRequest = {
  matchId: "11111111-1111-4111-8111-111111111111",
  expectedRevision: 0,
  clientCommandId: "22222222-2222-4222-8222-222222222222",
  uci: "e2e4",
};

Deno.test(
  "le contrat de commande accepte uniquement les quatre champs stricts",
  () => {
    const parsed = parseProcessMoveRequest(validRequest);
    assert(parsed.uci === "e2e4", "Le coup UCI doit être conservé.");

    assertCode(
      () => parseProcessMoveRequest({ ...validRequest, submittedClockMs: 12 }),
      "INVALID_REQUEST",
    );
    assertCode(
      () => parseProcessMoveRequest({ ...validRequest, expectedRevision: -1 }),
      "INVALID_REQUEST",
    );
    assertCode(
      () => parseProcessMoveRequest({ ...validRequest, uci: "e2e9" }),
      "INVALID_REQUEST",
    );
  },
);

Deno.test("le parseur UCI borne explicitement les promotions", () => {
  const promotion = parseUci("a7a8q");
  assert(
    promotion.from === "a7" &&
      promotion.to === "a8" &&
      promotion.promotion === "q",
    "La promotion UCI doit être explicite.",
  );
  assertCode(() => parseUci("a7a8k"), "INVALID_REQUEST");
});

Deno.test("le lecteur JSON refuse un corps au-delà de la borne", async () => {
  const request = new Request("https://edge.example.test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ payload: "x".repeat(64) }),
  });

  try {
    await readBoundedJson(request, 16);
  } catch (error) {
    assert(
      error instanceof MoveProcessingError && error.code === "INVALID_REQUEST",
      "Le corps surdimensionné doit être refusé.",
    );
    return;
  }
  throw new Error("Le corps surdimensionné a été accepté.");
});
