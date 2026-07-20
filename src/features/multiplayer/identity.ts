import type { MatchIdentity, MatchIdentityInput } from "./contracts";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RULESET_HASH_PATTERN = /^[0-9a-f]{64}$/i;
const ENGINE_VERSION_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._+-]{0,63}$/;

export class MatchIdentityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchIdentityError";
  }
}

const nonEmptyIdentifier = (value: string, label: string): string => {
  const normalized = value.trim();
  if (
    normalized.length === 0 ||
    normalized.length > 128 ||
    !UUID_PATTERN.test(normalized)
  ) {
    throw new MatchIdentityError(`${label} invalide.`);
  }
  return normalized.toLowerCase();
};

export const canonicalMatchSeed = (value: string | number | bigint): string => {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) {
      throw new MatchIdentityError(
        "Le matchSeed numérique doit être un entier JavaScript sûr.",
      );
    }
    return BigInt(value).toString();
  }

  if (typeof value === "bigint") {
    return value.toString();
  }

  const normalized = value.trim();
  if (!/^-?\d{1,20}$/.test(normalized)) {
    throw new MatchIdentityError("Le matchSeed doit être un entier décimal.");
  }

  try {
    const seed = BigInt(normalized);
    const postgresMin = -(2n ** 63n);
    const postgresMax = 2n ** 63n - 1n;
    if (seed < postgresMin || seed > postgresMax) {
      throw new MatchIdentityError("Le matchSeed dépasse un bigint Postgres.");
    }
    return seed.toString();
  } catch (error) {
    if (error instanceof MatchIdentityError) throw error;
    throw new MatchIdentityError("Le matchSeed doit être un entier décimal.");
  }
};

export const normalizeMatchIdentity = (
  input: MatchIdentityInput,
): MatchIdentity => {
  const rulesetHash = input.rulesetHash.trim().toLowerCase();
  if (!RULESET_HASH_PATTERN.test(rulesetHash)) {
    throw new MatchIdentityError(
      "L'empreinte rulesetHash doit être un SHA-256 hexadécimal.",
    );
  }

  const engineVersion = input.engineVersion.trim();
  if (!ENGINE_VERSION_PATTERN.test(engineVersion)) {
    throw new MatchIdentityError("La version du moteur est invalide.");
  }

  return Object.freeze({
    matchId: nonEmptyIdentifier(input.matchId, "matchId"),
    lobbyId: nonEmptyIdentifier(input.lobbyId, "lobbyId"),
    rulesetHash,
    matchSeed: canonicalMatchSeed(input.matchSeed),
    engineVersion,
  });
};

export const sameMatchIdentity = (
  left: MatchIdentity,
  right: MatchIdentity,
): boolean =>
  left.matchId === right.matchId &&
  left.lobbyId === right.lobbyId &&
  left.rulesetHash === right.rulesetHash &&
  left.matchSeed === right.matchSeed &&
  left.engineVersion === right.engineVersion;

export const assertCompatibleMatchIdentity = (
  expected: MatchIdentity,
  received: MatchIdentity,
): void => {
  if (!sameMatchIdentity(expected, received)) {
    throw new MatchIdentityError(
      "Événement refusé: matchId, lobbyId, rulesetHash, matchSeed ou version moteur incompatibles.",
    );
  }
};
