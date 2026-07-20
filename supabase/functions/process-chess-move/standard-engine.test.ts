import { MoveProcessingError } from "./protocol.ts";
import {
  CHESS_JS_VERSION,
  inspectStandardPosition,
  validateStandardMove,
} from "./standard-engine.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

const INITIAL_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

Deno.test("le validateur STANDARD utilise la version chess.js épinglée", () => {
  assert(
    CHESS_JS_VERSION === "1.4.0",
    "La version du moteur doit être stable.",
  );
});

Deno.test("un coup légal produit SAN, FEN et prochain joueur", () => {
  const move = validateStandardMove(INITIAL_FEN, "e2e4");
  assert(move.san === "e4", "Le SAN doit être calculé par chess.js.");
  assert(move.nextSide === "black", "Les noirs doivent jouer ensuite.");
  assert(
    move.fenAfter.startsWith("rnbqkbnr/pppppppp/8/8/4P3/"),
    "La FEN serveur doit refléter le coup.",
  );
  assert(move.terminal === null, "Le premier coup ne termine pas la partie.");
});

Deno.test(
  "un coup illégal est refusé sans modifier une autorité distante",
  () => {
    try {
      validateStandardMove(INITIAL_FEN, "e2e5");
    } catch (error) {
      assert(
        error instanceof MoveProcessingError && error.code === "ILLEGAL_MOVE",
        "Le coup illégal doit avoir un code stable.",
      );
      return;
    }
    throw new Error("Le coup illégal a été accepté.");
  },
);

Deno.test("une promotion explicite est validée", () => {
  const move = validateStandardMove("7k/P7/8/8/8/8/8/7K w - - 0 1", "a7a8q");
  assert(move.san.startsWith("a8=Q"), "La promotion doit figurer dans le SAN.");
});

Deno.test("le mat et la nulle par pat sont identifiés côté serveur", () => {
  const mate = validateStandardMove("7k/5Q2/6K1/8/8/8/8/8 w - - 0 1", "f7g7");
  assert(
    mate.terminal?.result === "1-0" &&
      mate.terminal.termination === "checkmate",
    "Le mat doit finaliser une victoire blanche.",
  );

  const stalemate = inspectStandardPosition("7k/5K2/6Q1/8/8/8/8/8 b - - 0 1");
  assert(
    stalemate.terminal?.result === "1/2-1/2" &&
      stalemate.terminal.termination === "stalemate",
    "Le pat doit produire une nulle.",
  );
});
