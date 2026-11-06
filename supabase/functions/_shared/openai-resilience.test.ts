import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { createStructuredResponse } from "./openai-responses.ts";

const schema = {
  type: "object",
  required: ["ok"],
  properties: { ok: { type: "boolean" } },
  additionalProperties: false,
};

function request(fetchImpl: typeof fetch) {
  return createStructuredResponse({
    apiKey: "server-only-test-key",
    model: "gpt-5.6-sol",
    systemPrompt: "Trusted server rules",
    userPrompt: "Design an ice chess variant",
    schemaName: "sol_chess_rule",
    schema,
    reasoningEffort: "medium",
    fetchImpl,
  });
}

Deno.test(
  "Sol requests are structured, private and authenticated from the Edge server",
  async () => {
    let endpoint: string | undefined;
    let config: RequestInit | undefined;
    const fetchImpl = ((url: string, options: RequestInit) => {
      endpoint = url;
      config = options;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            id: "resp_sol_test",
            status: "completed",
            output_text: '{"ok":true}',
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );
    }) as typeof fetch;

    const response = await request(fetchImpl);
    assertEquals(endpoint, "https://api.openai.com/v1/responses");
    const payload = JSON.parse(String(config?.body));
    assertEquals(payload.model, "gpt-5.6-sol");
    assertEquals(payload.store, false);
    assertEquals(payload.text.format.type, "json_schema");
    assertEquals(payload.text.format.strict, true);
    assertEquals(
      (config?.headers as Record<string, string>).Authorization,
      "Bearer server-only-test-key",
    );
    assertEquals(response.value, { ok: true });
  },
);

Deno.test(
  "transient provider HTTP failures are retried within the same bounded request",
  async () => {
    let attempts = 0;
    const fetchImpl = (() => {
      attempts++;
      return Promise.resolve(
        attempts === 1
          ? new Response('{"error":{"type":"server_error"}}', { status: 503 })
          : new Response(
              '{"status":"completed","output_text":"{\\"ok\\":true}"}',
              { status: 200 },
            ),
      );
    }) as typeof fetch;
    const response = await request(fetchImpl);
    assertEquals(attempts, 2);
    assertEquals(response.value, { ok: true });
  },
);

Deno.test("invalid credentials never trigger a retry loop", async () => {
  let attempts = 0;
  const fetchImpl = (() => {
    attempts++;
    return Promise.resolve(
      new Response('{"error":{"type":"invalid_api_key"}}', { status: 401 }),
    );
  }) as typeof fetch;
  await assertRejects(() => request(fetchImpl), Error);
  assertEquals(attempts, 1);
});
