import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  MatchCommand,
  MatchCommandReceipt,
  MatchEventStore,
  MatchIdentity,
  MatchRealtimeSource,
  MatchSyncView,
} from "./contracts";
import { deriveClock, ServerTimeEstimator } from "./clock";
import { PresenceLeaseTracker, type PresenceThresholds } from "./presence";
import { MultiplayerMatchSession } from "./session";

export interface UseMultiplayerMatchOptions {
  identity: MatchIdentity;
  store: MatchEventStore;
  realtime: MatchRealtimeSource;
  heartbeatIntervalMs?: number;
  presenceThresholds?: Partial<PresenceThresholds>;
}

export const useMultiplayerMatch = ({
  identity,
  store,
  realtime,
  heartbeatIntervalMs = 5_000,
  presenceThresholds,
}: UseMultiplayerMatchOptions) => {
  if (heartbeatIntervalMs < 1_000) {
    throw new Error("L'intervalle heartbeat doit être d'au moins une seconde.");
  }
  const presenceDisconnectAfterMs = presenceThresholds?.disconnectAfterMs;
  const presenceAbandonmentAfterMs = presenceThresholds?.abandonmentAfterMs;
  const session = useMemo(
    () => new MultiplayerMatchSession(identity, store, realtime),
    [identity, realtime, store],
  );
  const [view, setView] = useState<MatchSyncView>(session.view);
  const [displayNow, setDisplayNow] = useState(() => Date.now());
  const estimator = useMemo(() => {
    if (!identity.matchId) {
      throw new Error("matchId manquant pour l'estimation du temps serveur.");
    }
    return new ServerTimeEstimator();
  }, [identity.matchId]);
  const presence = useMemo(
    () =>
      new PresenceLeaseTracker({
        ...(presenceDisconnectAfterMs === undefined
          ? {}
          : { disconnectAfterMs: presenceDisconnectAfterMs }),
        ...(presenceAbandonmentAfterMs === undefined
          ? {}
          : { abandonmentAfterMs: presenceAbandonmentAfterMs }),
      }),
    [presenceAbandonmentAfterMs, presenceDisconnectAfterMs],
  );

  useEffect(() => session.subscribe(setView), [session]);

  useEffect(() => {
    void session.start().catch(() => {
      // Session exposes the fail-closed error state to the subscriber.
    });

    const handleOnline = () => session.setBrowserOnline(true);
    const handleOffline = () => session.setBrowserOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    session.setBrowserOnline(window.navigator.onLine);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      void session.stop();
    };
  }, [session]);

  useEffect(() => {
    let cancelled = false;
    const heartbeat = async () => {
      const sentAt = Date.now();
      try {
        const response = await store.heartbeat(
          identity,
          view.state.lastRevision,
        );
        const receivedAt = Date.now();
        if (!cancelled) {
          estimator.observe({
            clientSentAtMs: sentAt,
            clientReceivedAtMs: receivedAt,
            serverNow: response.serverNow,
          });
          presence.seed(response.participants);
          if (response.authoritativeRevision > view.state.lastRevision) {
            void session.recover();
          }
          setDisplayNow(receivedAt);
        }
      } catch {
        // Realtime status remains the connectivity source of truth.
      }
    };

    void heartbeat();
    const interval = window.setInterval(
      () => void heartbeat(),
      heartbeatIntervalMs,
    );
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [
    estimator,
    heartbeatIntervalMs,
    identity,
    presence,
    session,
    store,
    view.state.lastRevision,
  ]);

  useEffect(() => {
    if (!view.state.clock || view.state.phase !== "playing") return;
    const interval = window.setInterval(() => setDisplayNow(Date.now()), 250);
    return () => window.clearInterval(interval);
  }, [view.state.clock, view.state.phase]);

  useEffect(() => {
    presence.setLocalConnection(view.connection);
    presence.seed(view.state.participants);
  }, [presence, view.connection, view.state.participants]);

  const serverNowMs = estimator.estimateServerNow(displayNow);
  const clock = view.state.clock
    ? deriveClock(view.state.clock, serverNowMs)
    : null;
  const participantPresence = view.state.participants.map((participant) =>
    presence.assess(participant.userId, serverNowMs),
  );

  const submitCommand = useCallback(
    (command: MatchCommand): Promise<MatchCommandReceipt> =>
      session.submitCommand(command),
    [session],
  );
  const claimTimeout = useCallback(() => session.claimTimeout(), [session]);
  const resignMatch = useCallback(() => session.resignMatch(), [session]);

  return {
    ...view,
    clock,
    presence: participantPresence,
    submitCommand,
    claimTimeout,
    resignMatch,
    recover: () => session.recover(),
  };
};
