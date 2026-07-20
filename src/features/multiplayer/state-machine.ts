import type {
  AnyPersistedMatchEvent,
  MatchIdentity,
  MatchParticipant,
  MultiplayerMatchSnapshot,
  MultiplayerMatchState,
} from "./contracts";
import { assertCompatibleMatchIdentity } from "./identity";

export class MatchStateTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MatchStateTransitionError";
  }
}

export const createInitialMatchState = (
  identity: MatchIdentity,
): MultiplayerMatchState => ({
  identity,
  phase: "synchronizing",
  currentSide: null,
  moves: [],
  clock: null,
  participants: [],
  result: null,
  lastSequence: 0,
  lastRevision: -1,
  appliedEventIds: {},
  lastServerEventAt: null,
  error: null,
});

const validateMoves = (snapshot: MultiplayerMatchSnapshot): void => {
  snapshot.moves.forEach((move, index) => {
    if (move.ply !== index + 1) {
      throw new MatchStateTransitionError(
        `Snapshot refusé: ply ${move.ply} inattendu à l'index ${index}.`,
      );
    }
  });
};

export const hydrateMatchState = (
  expectedIdentity: MatchIdentity,
  snapshot: MultiplayerMatchSnapshot,
): MultiplayerMatchState => {
  assertCompatibleMatchIdentity(expectedIdentity, snapshot.identity);
  validateMoves(snapshot);
  if (snapshot.sequence !== snapshot.revision + 1) {
    throw new MatchStateTransitionError(
      "Snapshot refusé: séquence et révision incompatibles.",
    );
  }
  return {
    identity: expectedIdentity,
    phase: snapshot.phase,
    currentSide: snapshot.currentSide,
    moves: [...snapshot.moves],
    clock: snapshot.clock,
    participants: [...snapshot.participants],
    result: snapshot.result,
    lastSequence: snapshot.sequence,
    lastRevision: snapshot.revision,
    appliedEventIds: {},
    lastServerEventAt: snapshot.capturedAt,
    error: null,
  };
};

const upsertParticipant = (
  participants: readonly MatchParticipant[],
  update: MatchParticipant,
): MatchParticipant[] => {
  const index = participants.findIndex((item) => item.userId === update.userId);
  if (index === -1) return [...participants, update];
  return participants.map((item, itemIndex) =>
    itemIndex === index ? { ...item, ...update } : item,
  );
};

const assertActiveMatch = (state: MultiplayerMatchState): void => {
  if (state.phase !== "playing") {
    throw new MatchStateTransitionError(
      `Un coup ne peut pas être appliqué pendant la phase ${state.phase}.`,
    );
  }
};

const withEventMetadata = (
  state: MultiplayerMatchState,
  event: AnyPersistedMatchEvent,
): MultiplayerMatchState => ({
  ...state,
  lastSequence: event.sequence,
  lastRevision: event.revision,
  appliedEventIds: {
    ...state.appliedEventIds,
    [event.eventId]: true,
  },
  lastServerEventAt: event.occurredAt,
  error: null,
});

/** Deterministic, fail-closed projection of the persisted server event log. */
export const reduceMatchEvent = (
  current: MultiplayerMatchState,
  event: AnyPersistedMatchEvent,
): MultiplayerMatchState => {
  assertCompatibleMatchIdentity(current.identity, event.identity);

  if (current.appliedEventIds[event.eventId]) return current;
  if (event.sequence !== current.lastSequence + 1) {
    throw new MatchStateTransitionError(
      `Séquence invalide: ${event.sequence}, attendu ${current.lastSequence + 1}.`,
    );
  }
  if (event.sequence !== event.revision + 1) {
    throw new MatchStateTransitionError(
      `Révision ${event.revision} incompatible avec la séquence ${event.sequence}.`,
    );
  }
  if (event.revision !== current.lastRevision + 1) {
    throw new MatchStateTransitionError(
      `Révision invalide: ${event.revision}, attendu ${current.lastRevision + 1}.`,
    );
  }

  let state = current;
  switch (event.type) {
    case "match.waiting":
      if (current.phase !== "synchronizing" && current.phase !== "waiting") {
        throw new MatchStateTransitionError(
          `Retour à waiting interdit depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "waiting",
        participants: [...event.payload.participants],
        clock: event.payload.clock,
        currentSide: null,
      };
      break;

    case "match.started":
      if (current.phase !== "synchronizing" && current.phase !== "waiting") {
        throw new MatchStateTransitionError(
          `Démarrage interdit depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "playing",
        participants: [...event.payload.participants],
        currentSide: event.payload.currentSide,
        clock: event.payload.clock,
        result: null,
      };
      break;

    case "move.committed": {
      assertActiveMatch(current);
      const expectedPly = current.moves.length + 1;
      if (event.payload.move.ply !== expectedPly) {
        throw new MatchStateTransitionError(
          `Ply invalide: ${event.payload.move.ply}, attendu ${expectedPly}.`,
        );
      }
      if (
        current.currentSide !== null &&
        event.payload.move.side !== current.currentSide
      ) {
        throw new MatchStateTransitionError(
          `Coup ${event.payload.move.side} refusé pendant le tour ${current.currentSide}.`,
        );
      }
      state = {
        ...current,
        moves: [...current.moves, event.payload.move],
        currentSide: event.payload.nextSide,
        clock: event.payload.clock,
      };
      break;
    }

    case "participant.connected":
      state = {
        ...current,
        participants: upsertParticipant(current.participants, {
          userId: event.payload.userId,
          side: event.payload.side,
          connected: true,
          lastSeenAt: event.payload.observedAt,
        }),
      };
      break;

    case "participant.disconnected":
      state = {
        ...current,
        participants: upsertParticipant(current.participants, {
          userId: event.payload.userId,
          side: event.payload.side,
          connected: false,
          lastSeenAt: event.payload.observedAt,
        }),
      };
      break;

    case "match.paused":
      if (current.phase !== "playing" && current.phase !== "paused") {
        throw new MatchStateTransitionError(
          `Pause interdite depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "paused",
        clock: event.payload.clock,
      };
      break;

    case "match.resumed":
      if (current.phase !== "paused") {
        throw new MatchStateTransitionError(
          `Reprise interdite depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "playing",
        currentSide: event.payload.currentSide,
        clock: event.payload.clock,
      };
      break;

    case "match.finished":
      if (current.phase !== "playing" && current.phase !== "paused") {
        throw new MatchStateTransitionError(
          `Fin de partie interdite depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "finished",
        currentSide: null,
        clock: event.payload.clock,
        result: event.payload.result,
      };
      break;

    case "match.abandoned":
      if (
        current.phase !== "playing" &&
        current.phase !== "paused" &&
        current.phase !== "waiting"
      ) {
        throw new MatchStateTransitionError(
          `Abandon interdit depuis ${current.phase}.`,
        );
      }
      state = {
        ...current,
        phase: "abandoned",
        currentSide: null,
        clock: event.payload.clock,
        result: event.payload.result,
      };
      break;
  }

  return withEventMetadata(state, event);
};

export const withMatchStateError = (
  state: MultiplayerMatchState,
  error: unknown,
): MultiplayerMatchState => ({
  ...state,
  phase: "error",
  error:
    error instanceof Error ? error.message : "Erreur multijoueur inconnue.",
});
