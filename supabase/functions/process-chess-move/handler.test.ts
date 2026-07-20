import type { AuthenticatedClients } from "../_shared/auth-v2.ts";
import { createProcessChessMoveHandler } from "./index.ts";
import { sha256Hex, standardRulesetHash } from "./integrity.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(
      `${message} (attendu: ${String(expected)}, obtenu: ${String(actual)})`,
    );
  }
}

const MATCH_ID = "11111111-1111-4111-8111-111111111111";
const COMMAND_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_COMMAND_ID = "33333333-3333-4333-8333-333333333333";
const WHITE_PLAYER_ID = "44444444-4444-4444-8444-444444444444";
const BLACK_PLAYER_ID = "55555555-5555-4555-8555-555555555555";
const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

const validBody = {
  matchId: MATCH_ID,
  expectedRevision: 0,
  clientCommandId: CLIENT_COMMAND_ID,
  uci: "e2e4",
};

type DatabaseResult = { data: unknown; error: unknown };

interface RecordedCall {
  name: string;
  arguments?: Record<string, unknown>;
}

interface FakeScenario {
  submission: DatabaseResult;
  command: Record<string, unknown>;
  match: Record<string, unknown>;
  serviceRpc: Record<string, DatabaseResult>;
}

class FakeQueryBuilder {
  readonly #table: string;
  readonly #scenario: FakeScenario;
  readonly #calls: RecordedCall[];
  readonly #filters = new Map<string, unknown>();

  constructor(table: string, scenario: FakeScenario, calls: RecordedCall[]) {
    this.#table = table;
    this.#scenario = scenario;
    this.#calls = calls;
  }

  select(_columns: string): this {
    return this;
  }

  eq(column: string, value: unknown): this {
    this.#filters.set(column, value);
    return this;
  }

  maybeSingle(): Promise<DatabaseResult> {
    this.#calls.push({
      name: `service:read:${this.#table}`,
      arguments: Object.fromEntries(this.#filters),
    });

    if (this.#table === "chess_move_commands") {
      return Promise.resolve({ data: this.#scenario.command, error: null });
    }
    if (this.#table === "chess_matches") {
      return Promise.resolve({ data: this.#scenario.match, error: null });
    }
    return Promise.resolve({ data: null, error: { code: "UNEXPECTED_TABLE" } });
  }
}

function fakeAuthenticatedClients(
  scenario: FakeScenario,
  calls: RecordedCall[],
): AuthenticatedClients {
  const userClient = {
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ): Promise<DatabaseResult> => {
      calls.push({ name: `user:rpc:${name}`, arguments: args });
      if (name !== "submit_chess_move_command") {
        return Promise.resolve({
          data: null,
          error: { code: "UNEXPECTED_USER_RPC" },
        });
      }
      return Promise.resolve(scenario.submission);
    },
  };

  const serviceClient = {
    from: (table: string) => new FakeQueryBuilder(table, scenario, calls),
    rpc: (
      name: string,
      args: Record<string, unknown>,
    ): Promise<DatabaseResult> => {
      calls.push({ name: `service:rpc:${name}`, arguments: args });
      return Promise.resolve(
        scenario.serviceRpc[name] ?? {
          data: null,
          error: { code: "UNEXPECTED_SERVICE_RPC" },
        },
      );
    },
  };

  return {
    user: { id: WHITE_PLAYER_ID },
    userClient,
    serviceClient,
  } as unknown as AuthenticatedClients;
}

async function makeMatchRow(
  overrides: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const rulesetHash = await standardRulesetHash();
  const ruleStateHash = "a".repeat(64);
  return {
    id: MATCH_ID,
    status: "active",
    result: null,
    termination: null,
    white_player_id: WHITE_PLAYER_ID,
    black_player_id: BLACK_PLAYER_ID,
    ruleset_hash: rulesetHash,
    engine_version: "2.0.0",
    shared_seed: 42,
    current_fen: INITIAL_FEN,
    side_to_move: "white",
    revision: 0,
    clock_state: {
      whiteMs: 300_000,
      blackMs: 300_000,
      incrementMs: 0,
    },
    state: {
      rulesetType: "standard",
      engineVersion: "2.0.0",
      rulesetHash,
      ruleStateHash,
    },
    rule_state_hash: ruleStateHash,
    position_hash: await sha256Hex(INITIAL_FEN),
    started_at: "2026-07-20T12:00:00.000Z",
    last_move_at: "2026-07-20T12:00:00.000Z",
    verification_reference: null,
    ...overrides,
  };
}

function makeCommandRow(
  status: "pending" | "accepted" | "rejected" = "pending",
  uci = validBody.uci,
): Record<string, unknown> {
  return {
    id: COMMAND_ID,
    match_id: MATCH_ID,
    actor_id: WHITE_PLAYER_ID,
    client_command_id: CLIENT_COMMAND_ID,
    expected_revision: 0,
    uci,
    status,
    rejection_reason: null,
    created_at: "2026-07-20T12:00:01.000Z",
  };
}

function postRequest(
  body: unknown = validBody,
  options: {
    authorization?: boolean;
    origin?: string;
    contentType?: string;
  } = {},
): Request {
  const headers = new Headers({
    "Content-Type": options.contentType ?? "application/json",
  });
  if (options.authorization !== false) {
    headers.set("Authorization", "Bearer test-token");
  }
  if (options.origin) {
    headers.set("Origin", options.origin);
  }
  return new Request("https://edge.example.test/process-chess-move", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

async function responsePayload(
  response: Response,
): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function withAllowedOrigins(
  origins: string,
  run: () => Promise<void>,
): Promise<void> {
  const previous = Deno.env.get("ALLOWED_ORIGINS");
  Deno.env.set("ALLOWED_ORIGINS", origins);
  try {
    await run();
  } finally {
    if (previous === undefined) {
      Deno.env.delete("ALLOWED_ORIGINS");
    } else {
      Deno.env.set("ALLOWED_ORIGINS", previous);
    }
  }
}

Deno.test(
  "le handler borne CORS et la méthode avant toute authentification",
  async () => {
    let authenticationCalls = 0;
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => {
        authenticationCalls += 1;
        return Promise.reject(new Error("UNEXPECTED_AUTHENTICATION"));
      },
    });

    await withAllowedOrigins("https://app.example.test", async () => {
      const preflight = await handler(
        new Request("https://edge.example.test/process-chess-move", {
          method: "OPTIONS",
          headers: { Origin: "https://app.example.test" },
        }),
      );
      assertEquals(preflight.status, 204, "Le preflight autorisé doit réussir");
      assertEquals(
        preflight.headers.get("access-control-allow-origin"),
        "https://app.example.test",
        "L'origine autorisée doit être reflétée",
      );

      const forbiddenOrigin = await handler(
        postRequest(validBody, {
          origin: "https://evil.example.test",
        }),
      );
      assertEquals(
        forbiddenOrigin.status,
        403,
        "Une origine inconnue doit être refusée",
      );

      const wrongMethod = await handler(
        new Request("https://edge.example.test/process-chess-move", {
          method: "GET",
          headers: { Origin: "https://app.example.test" },
        }),
      );
      assertEquals(wrongMethod.status, 405, "Seul POST doit être accepté");
      const payload = await responsePayload(wrongMethod);
      assertEquals(
        (payload.error as Record<string, unknown>).code,
        "METHOD_NOT_ALLOWED",
        "Le code de méthode doit rester stable",
      );
    });

    assertEquals(
      authenticationCalls,
      0,
      "CORS et méthode doivent précéder l'authentification",
    );
  },
);

Deno.test(
  "le handler refuse un JSON non strict avant toute authentification",
  async () => {
    let authenticationCalls = 0;
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => {
        authenticationCalls += 1;
        return Promise.reject(new Error("UNEXPECTED_AUTHENTICATION"));
      },
    });

    const extraField = await handler(
      postRequest({ ...validBody, fen: INITIAL_FEN }),
    );
    assertEquals(
      extraField.status,
      400,
      "Un champ supplémentaire doit être refusé",
    );
    assertEquals(
      (
        (await responsePayload(extraField).then(
          (body) => body.error,
        )) as Record<string, unknown>
      ).code,
      "INVALID_REQUEST",
      "Le code de corps invalide doit rester stable",
    );

    const wrongContentType = await handler(
      postRequest(validBody, {
        contentType: "text/plain",
      }),
    );
    assertEquals(
      wrongContentType.status,
      400,
      "Le type de contenu doit être JSON",
    );
    assertEquals(
      authenticationCalls,
      0,
      "Le corps doit être borné avant l'authentification",
    );
  },
);

Deno.test(
  "le handler refuse une requête sans authentification sans appel réseau",
  async () => {
    const handler = createProcessChessMoveHandler();
    const response = await handler(
      postRequest(validBody, { authorization: false }),
    );
    const payload = await responsePayload(response);

    assertEquals(response.status, 401, "Le JWT doit être obligatoire");
    assertEquals(
      (payload.error as Record<string, unknown>).code,
      "AUTH_REQUIRED",
      "Le code d'authentification doit rester stable",
    );
  },
);

Deno.test(
  "un coup légal suit submit puis lectures exactes puis commit atomique",
  async () => {
    const calls: RecordedCall[] = [];
    const scenario: FakeScenario = {
      submission: { data: [{ command_id: COMMAND_ID }], error: null },
      command: makeCommandRow(),
      match: await makeMatchRow(),
      serviceRpc: {
        commit_and_finalize_chess_move_server: {
          data: [{ move_revision: 1, authoritative_revision: 1 }],
          error: null,
        },
      },
    };
    const clients = fakeAuthenticatedClients(scenario, calls);
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => Promise.resolve(clients),
    });

    const response = await handler(postRequest());
    const payload = await responsePayload(response);
    const data = payload.data as Record<string, unknown>;
    const move = data.move as Record<string, unknown>;

    assertEquals(response.status, 200, "Le coup légal doit être accepté");
    assertEquals(
      data.commandStatus,
      "accepted",
      "La commande doit être acceptée",
    );
    assertEquals(move.san, "e4", "Le SAN doit venir du validateur serveur");
    assertEquals(move.revision, 1, "La révision du coup doit être incrémentée");
    assertEquals(
      calls.map((call) => call.name).join(" -> "),
      [
        "user:rpc:submit_chess_move_command",
        "service:read:chess_move_commands",
        "service:read:chess_matches",
        "service:rpc:commit_and_finalize_chess_move_server",
      ].join(" -> "),
      "La chaîne d'autorité doit être submit → read → commit",
    );
    const commandRead = calls[1].arguments ?? {};
    assertEquals(
      commandRead.id,
      COMMAND_ID,
      "La lecture doit être bornée à la commande",
    );
    assertEquals(
      commandRead.match_id,
      MATCH_ID,
      "La lecture doit aussi être bornée à la partie",
    );
  },
);

Deno.test(
  "un coup illégal est rejeté et n'atteint jamais le commit",
  async () => {
    const calls: RecordedCall[] = [];
    const scenario: FakeScenario = {
      submission: { data: [{ command_id: COMMAND_ID }], error: null },
      command: makeCommandRow("pending", "e2e5"),
      match: await makeMatchRow(),
      serviceRpc: {
        reject_chess_move_command_server: { data: true, error: null },
      },
    };
    const clients = fakeAuthenticatedClients(scenario, calls);
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => Promise.resolve(clients),
    });

    const response = await handler(postRequest({ ...validBody, uci: "e2e5" }));
    const payload = await responsePayload(response);
    const rejection = calls.find(
      (call) => call.name === "service:rpc:reject_chess_move_command_server",
    );

    assertEquals(response.status, 422, "Le coup illégal doit être refusé");
    assertEquals(
      (payload.error as Record<string, unknown>).code,
      "ILLEGAL_MOVE",
      "La raison de rejet doit être stable",
    );
    assert(rejection, "Le rejet doit être persisté côté serveur");
    assertEquals(
      rejection.arguments?.p_reason,
      "ILLEGAL_MOVE",
      "Le RPC de rejet doit recevoir la raison exacte",
    );
    assert(
      !calls.some(
        (call) =>
          call.name === "service:rpc:commit_and_finalize_chess_move_server",
      ),
      "Un coup illégal ne doit jamais être commité",
    );
  },
);

Deno.test(
  "un retry déjà accepté est idempotent et ne recommit pas le coup",
  async () => {
    const calls: RecordedCall[] = [];
    const scenario: FakeScenario = {
      submission: { data: [{ command_id: COMMAND_ID }], error: null },
      command: makeCommandRow("accepted"),
      match: await makeMatchRow({ revision: 1 }),
      serviceRpc: {},
    };
    const clients = fakeAuthenticatedClients(scenario, calls);
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => Promise.resolve(clients),
    });

    const response = await handler(postRequest());
    const payload = await responsePayload(response);
    const data = payload.data as Record<string, unknown>;

    assertEquals(response.status, 200, "Le retry accepté doit réussir");
    assertEquals(
      data.alreadyProcessed,
      true,
      "Le retry doit être signalé comme déjà traité",
    );
    assertEquals(data.revision, 1, "La révision canonique doit être renvoyée");
    assert(
      !calls.some((call) => call.name.startsWith("service:rpc:")),
      "Un retry accepté ne doit appeler ni commit ni rejet",
    );
  },
);

Deno.test(
  "le verdict timeout calculé par PostgreSQL est relayé sans présomption locale",
  async () => {
    const calls: RecordedCall[] = [];
    const scenario: FakeScenario = {
      submission: {
        data: null,
        error: { code: "P0001", message: "CLOCK_EXPIRED" },
      },
      command: makeCommandRow(),
      match: await makeMatchRow(),
      serviceRpc: {
        finalize_chess_timeout_server: {
          data: [
            {
              result: "1/2-1/2",
              termination: "timeout-insufficient-material",
            },
          ],
          error: null,
        },
      },
    };
    const clients = fakeAuthenticatedClients(scenario, calls);
    const handler = createProcessChessMoveHandler({
      authenticateRequest: () => Promise.resolve(clients),
    });

    const response = await handler(postRequest());
    const payload = await responsePayload(response);
    const data = payload.data as Record<string, unknown>;
    const terminal = data.terminal as Record<string, unknown>;

    assertEquals(
      response.status,
      409,
      "Le coup arrivé après expiration doit être refusé",
    );
    assertEquals(
      (payload.error as Record<string, unknown>).code,
      "CLOCK_EXPIRED",
      "Le code timeout doit rester stable",
    );
    assertEquals(
      terminal.result,
      "1/2-1/2",
      "Le verdict DB doit être relayé tel quel",
    );
    assertEquals(
      terminal.termination,
      "timeout-insufficient-material",
      "La terminaison DB ne doit pas être recalculée dans le handler",
    );
    assertEquals(
      data.revision,
      1,
      "La révision autoritaire du verdict doit être renvoyée",
    );
    assertEquals(
      calls.map((call) => call.name).join(" -> "),
      [
        "user:rpc:submit_chess_move_command",
        "service:read:chess_matches",
        "service:rpc:finalize_chess_timeout_server",
      ].join(" -> "),
      "Le timeout de soumission doit relire la partie puis demander le verdict DB",
    );
  },
);
