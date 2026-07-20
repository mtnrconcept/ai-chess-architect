import type {
  AnyPersistedMatchEvent,
  MatchEventPayloadMap,
  MatchEventType,
  MatchIdentity,
  MatchMove,
  PersistedMatchEvent,
  ServerClockAnchor,
} from "../contracts";
import { normalizeMatchIdentity } from "../identity";

export const MATCH_ID = "11111111-1111-4111-8111-111111111111";
export const LOBBY_ID = "22222222-2222-4222-8222-222222222222";
export const HASH = "a".repeat(64);
export const T0 = "2026-07-20T12:00:00.000Z";

export const identity: MatchIdentity = normalizeMatchIdentity({
  matchId: MATCH_ID,
  lobbyId: LOBBY_ID,
  rulesetHash: HASH,
  matchSeed: "1948897573444275",
  engineVersion: "2.0.0",
});

export const clock = (
  activeSide: ServerClockAnchor["activeSide"] = "white",
  overrides: Partial<ServerClockAnchor> = {},
): ServerClockAnchor => ({
  whiteRemainingMs: 300_000,
  blackRemainingMs: 300_000,
  activeSide,
  turnStartedAt: activeSide ? T0 : null,
  pausedAt: null,
  serverNow: T0,
  ...overrides,
});

export const move = (
  ply: number,
  side: MatchMove["side"],
  from: string,
  to: string,
): MatchMove => ({
  ply,
  side,
  from,
  to,
  uci: `${from}${to}`,
  positionHash: `position-${ply}`,
});

export const event = <Type extends MatchEventType>(
  sequence: number,
  type: Type,
  payload: MatchEventPayloadMap[Type],
  eventId = `event-${sequence}`,
): PersistedMatchEvent<Type> =>
  ({
    eventId,
    clientEventId: null,
    sequence,
    revision: sequence - 1,
    identity,
    actorId: null,
    type,
    payload,
    occurredAt: new Date(Date.parse(T0) + sequence * 1_000).toISOString(),
  }) as PersistedMatchEvent<Type>;

export const asAnyEvent = <Type extends MatchEventType>(
  value: PersistedMatchEvent<Type>,
): AnyPersistedMatchEvent => value as AnyPersistedMatchEvent;

export const participants = [
  {
    userId: "player-white",
    side: "white" as const,
    displayName: "White",
    connected: true,
    lastSeenAt: T0,
  },
  {
    userId: "player-black",
    side: "black" as const,
    displayName: "Black",
    connected: true,
    lastSeenAt: T0,
  },
];
