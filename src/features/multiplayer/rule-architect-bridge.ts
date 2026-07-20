import type { MatchIdentity, MatchIdentityInput } from "./contracts";
import { normalizeMatchIdentity } from "./identity";

export interface RuleArchitectRuntimeIdentity {
  lobbyId: string;
  rulesetHash: string;
  matchSeed: string | number | bigint;
  engineVersion: string;
  status: "matched";
}

/**
 * Bridges the immutable Rule Architect lobby runtime to multiplayer identity.
 * The dedicated server-created match UUID is mandatory: conflating it with a
 * lobby UUID would make resume and event scoping ambiguous.
 */
export const matchIdentityFromRuleArchitectRuntime = (
  runtime: RuleArchitectRuntimeIdentity,
  matchId: string,
): MatchIdentity =>
  normalizeMatchIdentity({
    matchId,
    lobbyId: runtime.lobbyId,
    rulesetHash: runtime.rulesetHash,
    matchSeed: runtime.matchSeed,
    engineVersion: runtime.engineVersion,
  } satisfies MatchIdentityInput);
