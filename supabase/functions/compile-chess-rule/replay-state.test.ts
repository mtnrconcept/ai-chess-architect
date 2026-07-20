import {
  classifyCompilationReplay,
  DEFAULT_STALE_PROCESSING_SECONDS,
  MAX_STALE_PROCESSING_SECONDS,
  MIN_STALE_PROCESSING_SECONDS,
  parseStaleProcessingSeconds,
  STALE_PROCESSING_FAILURE_CODE,
  type CompilationReplayState,
} from "./replay-state.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const NOW = Date.parse("2026-07-20T12:00:00.000Z");
const FUTURE_EXPIRY = "2026-07-27T12:00:00.000Z";

const processingRow = (updatedAt: string): CompilationReplayState => ({
  status: "processing",
  updated_at: updatedAt,
  expires_at: FUTURE_EXPIRY,
  metrics: {
    premiumRequested: false,
    premiumGranted: false,
  },
});

Deno.test(
  "le seuil processing est configurable mais borné au-dessus du timeout OpenAI",
  () => {
    assert(
      parseStaleProcessingSeconds(undefined) ===
        DEFAULT_STALE_PROCESSING_SECONDS,
      "La valeur par défaut doit être stable.",
    );
    assert(
      parseStaleProcessingSeconds("  ") === DEFAULT_STALE_PROCESSING_SECONDS,
      "Une variable vide doit utiliser la valeur par défaut.",
    );
    assert(
      parseStaleProcessingSeconds("1") === MIN_STALE_PROCESSING_SECONDS,
      "Le seuil ne doit jamais être inférieur à la borne sûre.",
    );
    assert(
      parseStaleProcessingSeconds("99999") === MAX_STALE_PROCESSING_SECONDS,
      "Le seuil doit avoir une borne supérieure.",
    );
  },
);

Deno.test(
  "un replay processing actif reste bloqué sans demander une nouvelle clé",
  () => {
    const disposition = classifyCompilationReplay(
      processingRow("2026-07-20T11:57:01.000Z"),
      180,
      NOW,
    );

    assert(
      disposition.kind === "processing-active",
      "Une réservation de 179 secondes doit rester active.",
    );
    assert(
      disposition.httpStatus === 409 &&
        disposition.retryable &&
        !disposition.newRequestRequired,
      "Le client doit rejouer la même clé tant que la réservation est active.",
    );
  },
);

Deno.test(
  "deux replays simultanés avant le seuil restent tous deux sur la réservation active",
  () => {
    const row = processingRow("2026-07-20T11:57:01.000Z");
    const dispositions = [
      classifyCompilationReplay(row, 180, NOW),
      classifyCompilationReplay(row, 180, NOW),
    ];

    assert(
      dispositions.every(
        (disposition) =>
          disposition.kind === "processing-active" &&
          disposition.httpStatus === 409 &&
          !disposition.newRequestRequired,
      ),
      "Aucun replay actif ne doit réclamer une nouvelle réservation ou autoriser un second appel.",
    );
  },
);

Deno.test(
  "un replay processing au seuil devient stale et exige une nouvelle clé",
  () => {
    const disposition = classifyCompilationReplay(
      processingRow("2026-07-20T11:57:00.000Z"),
      180,
      NOW,
    );

    assert(
      disposition.kind === "processing-stale",
      "Une réservation arrivée au seuil doit être récupérée.",
    );
    assert(
      disposition.code === STALE_PROCESSING_FAILURE_CODE &&
        disposition.httpStatus === 410 &&
        disposition.newRequestRequired &&
        !disposition.retryable,
      "Une réservation stale doit produire le contrat 410 stable.",
    );
  },
);

Deno.test(
  "une réservation stale persistée en failed reste terminale au replay",
  () => {
    const failed: CompilationReplayState = {
      status: "failed",
      updated_at: "2026-07-20T12:00:00.000Z",
      expires_at: FUTURE_EXPIRY,
      metrics: {
        failureCode: STALE_PROCESSING_FAILURE_CODE,
      },
    };
    const disposition = classifyCompilationReplay(failed, 180, NOW);

    assert(
      disposition.kind === "failed" &&
        disposition.code === STALE_PROCESSING_FAILURE_CODE &&
        disposition.httpStatus === 410 &&
        disposition.newRequestRequired,
      "Le failed stale ne doit jamais redevenir processing ni relancer le provider.",
    );
  },
);
