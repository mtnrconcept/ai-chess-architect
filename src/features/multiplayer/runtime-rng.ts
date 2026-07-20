import { ChessEngine } from "@/lib/chessEngine";
import { createDeterministicRandom } from "@/rules-v2";
import type { ChessPiece } from "@/types/chess";
import type { MatchIdentity } from "./contracts";

export const createMatchRandom = (
  identity: MatchIdentity,
  scope: string,
): (() => number) => {
  if (!/^[a-zA-Z0-9._:-]{1,80}$/.test(scope)) {
    throw new Error("Le scope RNG du match est invalide.");
  }
  return createDeterministicRandom(
    `${identity.matchSeed}|${identity.rulesetHash}|${identity.engineVersion}|${scope}`,
  );
};

export const applyDeterministicSecretSetup = (
  board: (ChessPiece | null)[][],
  identity: MatchIdentity,
): (ChessPiece | null)[][] =>
  ChessEngine.applySecretSetup(
    board,
    createMatchRandom(identity, "secret-setup-v1"),
  );
