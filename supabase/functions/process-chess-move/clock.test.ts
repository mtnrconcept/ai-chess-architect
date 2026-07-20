import { computeAuthoritativeClock, parseClockState } from "./clock.ts";
import { MoveProcessingError } from "./protocol.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const START = "2026-07-20T12:00:00.000Z";

Deno.test("l'horloge déduit le temps serveur puis applique l'incrément", () => {
  const transition = computeAuthoritativeClock(
    { whiteMs: 60_000, blackMs: 60_000, incrementMs: 2_000 },
    "white",
    START,
    Date.parse("2026-07-20T12:00:03.250Z"),
  );

  assert(!transition.expired, "L'horloge ne doit pas être expirée.");
  assert(transition.spentMs === 3_250, "Le temps écoulé vient du serveur.");
  assert(
    transition.state.whiteMs === 58_750 && transition.state.blackMs === 60_000,
    "Seule l'horloge du joueur actif doit changer.",
  );
});

Deno.test("l'horloge refuse le coup exactement à l'expiration", () => {
  const transition = computeAuthoritativeClock(
    { whiteMs: 3_000, blackMs: 60_000, incrementMs: 5_000 },
    "white",
    START,
    Date.parse("2026-07-20T12:00:03.000Z"),
  );

  assert(transition.expired, "Zéro milliseconde restante doit expirer.");
  assert(
    transition.state.whiteMs === 0,
    "Aucun incrément ne doit sauver un joueur déjà au temps.",
  );
});

Deno.test("une horloge non entière ou incomplète échoue fermée", () => {
  try {
    parseClockState({ whiteMs: 1.5, blackMs: 20_000, incrementMs: 0 });
  } catch (error) {
    assert(
      error instanceof MoveProcessingError &&
        error.code === "INVALID_CLOCK_STATE",
      "Un état d'horloge invalide doit être refusé.",
    );
    return;
  }
  throw new Error("Une horloge invalide a été acceptée.");
});
