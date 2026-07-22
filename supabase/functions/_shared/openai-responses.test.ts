import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  createStructuredResponse,
  normalizeOpenAIUsage,
  normalizeProviderIdentifier,
  resolveStructuredResponseTimeout,
} from "./openai-responses.ts";

const structuredInput = (fetchImpl: typeof fetch, signal?: AbortSignal) => ({
  apiKey: "test-key",
  model: "test-model",
  systemPrompt: "SYSTEM",
  userPrompt: "USER",
  schemaName: "test_schema",
  schema: {
    type: "object",
    properties: { ok: { type: "boolean" } },
    required: ["ok"],
    additionalProperties: false,
  },
  reasoningEffort: "low" as const,
  fetchImpl,
  signal,
});

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

Deno.test("openai-responses: projette les métriques fournisseur", () => {
  assertEquals(
    normalizeOpenAIUsage({
      input_tokens: 123,
      output_tokens: 45,
      total_tokens: 168,
      provider_private_detail: "must-not-persist",
    }),
    {
      input_tokens: 123,
      output_tokens: 45,
      total_tokens: 168,
    },
  );
  assertEquals(normalizeOpenAIUsage({ total_tokens: -1 }), null);
  assertEquals(normalizeOpenAIUsage({ total_tokens: 12.5 }), null);
  assertEquals(normalizeOpenAIUsage({ total_tokens: 100_000_001 }), null);
  assertEquals(normalizeOpenAIUsage({ total_tokens: Number.NaN }), null);
  assertEquals(normalizeOpenAIUsage("invalid"), null);
});

Deno.test("openai-responses: borne les identifiants fournisseur", () => {
  assertEquals(
    normalizeProviderIdentifier("resp_abc-123:eu.west"),
    "resp_abc-123:eu.west",
  );
  assertEquals(normalizeProviderIdentifier(""), null);
  assertEquals(normalizeProviderIdentifier("bad id\nsecret"), null);
  assertEquals(normalizeProviderIdentifier("x".repeat(161)), null);
  assertEquals(normalizeProviderIdentifier({ id: "resp_hidden" }), null);
});

Deno.test("openai-responses: refuse une génération incomplete", async () => {
  const fetchImpl = (() =>
    Promise.resolve(
      new Response(
        JSON.stringify({
          id: "resp_incomplete",
          status: "incomplete",
          incomplete_details: { reason: "max_output_tokens" },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    )) as typeof fetch;

  await assertRejects(
    () => createStructuredResponse(structuredInput(fetchImpl)),
    Error,
    "La génération est incomplète",
  );
});

Deno.test(
  "openai-responses: annule aussi un corps provider bloqué",
  async () => {
    let bodyStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      bodyStarted = resolve;
    });
    const fetchImpl = ((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          bodyStarted();
          const abort = () =>
            controller.error(
              init?.signal?.reason ?? new DOMException("aborted", "AbortError"),
            );
          if (init?.signal?.aborted) abort();
          else init?.signal?.addEventListener("abort", abort, { once: true });
        },
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }) as typeof fetch;
    const controller = new AbortController();
    const pending = createStructuredResponse(
      structuredInput(fetchImpl, controller.signal),
    );

    await started;
    controller.abort(new DOMException("client disconnected", "AbortError"));
    await assertRejects(
      () => pending,
      Error,
      "La génération structurée n'a pas abouti",
    );
  },
);
