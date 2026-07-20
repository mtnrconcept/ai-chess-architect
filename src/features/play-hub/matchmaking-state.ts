import type {
  ChessMatchmakingResult,
  ChessMatchmakingTicket,
} from "./platform-api";

type MatchmakingState = ChessMatchmakingResult | ChessMatchmakingTicket;

export function resolveActiveMatchmakingTicket(input: {
  hasServerResponse: boolean;
  serverTicket: ChessMatchmakingTicket | null | undefined;
  pendingResult: ChessMatchmakingResult | null;
}): MatchmakingState | null {
  if (input.hasServerResponse) {
    return input.serverTicket?.status === "queued" ? input.serverTicket : null;
  }
  return input.pendingResult?.status === "queued" ||
    input.pendingResult?.status === "matched"
    ? input.pendingResult
    : null;
}
