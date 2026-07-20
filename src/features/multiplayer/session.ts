import type {
  AnyPersistedMatchEvent,
  MatchCommand,
  MatchCommandReceipt,
  MatchEventStore,
  MatchFinalizationReceipt,
  MatchIdentity,
  MatchRealtimeSource,
  MatchRealtimeSubscription,
  MatchSyncView,
  MultiplayerMatchState,
  RealtimeConnectionStatus,
} from "./contracts";
import { MatchEventStream } from "./event-stream";
import { assertCompatibleMatchIdentity } from "./identity";
import {
  createInitialMatchState,
  hydrateMatchState,
  reduceMatchEvent,
  withMatchStateError,
} from "./state-machine";

export interface MultiplayerSessionOptions {
  historyPageSize?: number;
  maxHistoryPages?: number;
}

export type MatchSyncListener = (view: MatchSyncView) => void;

/**
 * Subscribe-before-replay session. Realtime may overlap or arrive out of order;
 * the sequence stream makes recovery deterministic and gap-aware.
 */
export class MultiplayerMatchSession {
  private state: MultiplayerMatchState;
  private stream: MatchEventStream;
  private connection: RealtimeConnectionStatus = "idle";
  private subscription: MatchRealtimeSubscription | null = null;
  private readonly listeners = new Set<MatchSyncListener>();
  private recovery: Promise<void> | null = null;
  private serial: Promise<void> = Promise.resolve();
  private stopped = false;
  private realtimeConfirmed = false;
  private readonly pageSize: number;
  private readonly maxPages: number;

  constructor(
    readonly identity: MatchIdentity,
    private readonly store: MatchEventStore,
    private readonly realtime: MatchRealtimeSource,
    options: MultiplayerSessionOptions = {},
  ) {
    this.pageSize = options.historyPageSize ?? 200;
    this.maxPages = options.maxHistoryPages ?? 100;
    if (
      !Number.isSafeInteger(this.pageSize) ||
      this.pageSize < 1 ||
      this.pageSize > 1_000 ||
      !Number.isSafeInteger(this.maxPages) ||
      this.maxPages < 1
    ) {
      throw new Error("Configuration de reprise multijoueur invalide.");
    }
    this.state = createInitialMatchState(identity);
    this.stream = new MatchEventStream(identity);
  }

  get view(): MatchSyncView {
    return {
      state: this.state,
      connection: this.connection,
      bufferedEvents: this.stream.bufferedCount,
      missingSequence: this.stream.missingSequence,
    };
  }

  subscribe(listener: MatchSyncListener): () => void {
    this.listeners.add(listener);
    listener(this.view);
    return () => this.listeners.delete(listener);
  }

  async start(): Promise<void> {
    if (this.subscription || this.stopped) return;
    this.setConnection("connecting");

    this.subscription = await this.realtime.subscribe(this.identity, {
      onEvent: (event) => {
        this.enqueue(async () => {
          await this.ingest(event);
        });
      },
      onStatus: (status, error) => {
        this.enqueue(async () => {
          this.realtimeConfirmed = status === "connected";
          this.setConnection(status);
          if (error) this.reportNonFatal(error);
          if (status === "connected" || status === "reconnecting") {
            await this.recover();
          }
        });
      },
    });

    await this.recover();
  }

  async recover(): Promise<void> {
    if (this.stopped) return;
    if (this.recovery) return this.recovery;

    this.recovery = this.performRecovery();
    try {
      await this.recovery;
    } catch (error) {
      this.fail(error);
      throw error;
    } finally {
      this.recovery = null;
    }
  }

  async submitCommand(command: MatchCommand): Promise<MatchCommandReceipt> {
    if (this.stopped) throw new Error("La session multijoueur est fermée.");
    assertCompatibleMatchIdentity(this.identity, command.identity);
    if (command.expectedRevision !== this.state.lastRevision) {
      throw new Error(
        `Commande obsolète: révision ${command.expectedRevision}, état ${this.state.lastRevision}.`,
      );
    }
    if (this.connection !== "connected") {
      throw new Error(
        "Connexion Realtime non confirmée: la commande classée reste en attente.",
      );
    }

    const receipt = await this.store.submitCommand(command);
    if (receipt.clientCommandId !== command.clientCommandId) {
      throw new Error("Confirmation idempotente du serveur invalide.");
    }
    const invalidRevision =
      receipt.authoritativeRevision < command.expectedRevision ||
      (receipt.status === "pending" &&
        receipt.authoritativeRevision !== command.expectedRevision);
    if (invalidRevision) {
      throw new Error(
        "Le serveur a confirmé une révision ou un statut de commande inattendu.",
      );
    }
    // Never project the proposed move. Only move_committed from replay or
    // Realtime is allowed to mutate the state machine.
    if (receipt.authoritativeRevision > this.state.lastRevision) {
      await this.recover();
    }
    return receipt;
  }

  async claimTimeout(): Promise<MatchFinalizationReceipt> {
    if (this.stopped) throw new Error("La session multijoueur est fermée.");
    if (this.connection !== "connected") {
      throw new Error(
        "Connexion Realtime non confirmée: le temps ne peut pas être réclamé.",
      );
    }
    if (this.state.phase !== "playing") {
      throw new Error(
        "Une partie inactive ne peut pas être réclamée au temps.",
      );
    }
    return this.store.claimTimeout(this.identity, this.state.lastRevision);
  }

  async resignMatch(): Promise<MatchFinalizationReceipt> {
    if (this.stopped) throw new Error("La session multijoueur est fermée.");
    if (this.connection !== "connected") {
      throw new Error(
        "Connexion Realtime non confirmée: l'abandon ne peut pas être envoyé.",
      );
    }
    if (this.state.phase !== "playing" && this.state.phase !== "paused") {
      throw new Error("Une partie inactive ne peut pas être abandonnée.");
    }
    return this.store.resignMatch(this.identity, this.state.lastRevision);
  }

  setBrowserOnline(online: boolean): void {
    if (!online) {
      this.setConnection("offline");
      return;
    }
    if (this.connection === "offline") {
      this.setConnection("reconnecting");
      this.enqueue(() => this.recover());
    }
  }

  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    await this.subscription?.unsubscribe();
    this.subscription = null;
    this.setConnection("closed");
  }

  private async performRecovery(): Promise<void> {
    if (this.state.phase === "synchronizing") {
      const snapshot = await this.store.loadSnapshot(this.identity.matchId);
      if (snapshot) {
        this.state = hydrateMatchState(this.identity, snapshot);
        this.stream.reset(snapshot.sequence);
        this.emit();
      }
    }

    for (let page = 0; page < this.maxPages; page += 1) {
      const events = await this.store.listEventsAfter(
        this.identity.matchId,
        this.stream.lastSequence,
        this.pageSize,
      );
      if (events.length === 0) break;
      await this.ingest(events);
      if (events.length < this.pageSize) break;
      if (page === this.maxPages - 1) {
        throw new Error(
          "Historique multijoueur trop long pour une reprise bornée.",
        );
      }
    }

    if (this.stream.missingSequence !== null) {
      this.setConnection("reconnecting");
    } else if (
      this.realtimeConfirmed &&
      this.connection !== "offline" &&
      this.connection !== "closed"
    ) {
      this.setConnection("connected");
    }
  }

  private async ingest(
    incoming: AnyPersistedMatchEvent | readonly AnyPersistedMatchEvent[],
  ): Promise<void> {
    const result = this.stream.ingest(incoming);
    for (const event of result.ready) {
      this.state = reduceMatchEvent(this.state, event);
    }
    this.emit();
    if (result.missingSequence !== null && !this.recovery) {
      await this.recover();
    }
  }

  private setConnection(status: RealtimeConnectionStatus): void {
    if (this.connection === status) return;
    this.connection = status;
    this.emit();
  }

  private fail(error: unknown): void {
    this.state = withMatchStateError(this.state, error);
    this.connection = "error";
    this.emit();
  }

  private reportNonFatal(error: Error): void {
    console.error("[multiplayer/realtime]", error);
  }

  private enqueue(operation: () => Promise<void>): void {
    this.serial = this.serial.then(operation).catch((error: unknown) => {
      this.fail(error);
    });
  }

  private emit(): void {
    const view = this.view;
    for (const listener of this.listeners) listener(view);
  }
}
