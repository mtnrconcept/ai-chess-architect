import type { DerivedClock } from "./clock";
import type { MatchSide, MultiplayerPhase } from "./contracts";

export interface TimeoutClaimVisibilityInput {
  phase: MultiplayerPhase;
  playerSide: MatchSide | null;
  clock: DerivedClock | null;
}

/**
 * Display guard only. The database recomputes expiration and claimant identity;
 * a browser reaching zero never finalizes a game by itself.
 */
export const canClaimDisplayedTimeout = ({
  phase,
  playerSide,
  clock,
}: TimeoutClaimVisibilityInput): boolean =>
  phase === "playing" &&
  playerSide !== null &&
  clock !== null &&
  clock.activeSide !== null &&
  clock.activeSide !== playerSide &&
  clock.timedOutSide === clock.activeSide;
