import type {
  MatchCommand,
  MatchCommandReceipt,
  MatchIdentity,
} from "./contracts";
import { assertCompatibleMatchIdentity, sameMatchIdentity } from "./identity";

export interface CommandOutboxStorage {
  load(identity: MatchIdentity): Promise<MatchCommand[]>;
  save(
    identity: MatchIdentity,
    commands: readonly MatchCommand[],
  ): Promise<void>;
}

export interface CommandOutboxOptions {
  /** Ranked games should keep this at one: never speculate several plies. */
  capacity?: number;
  /** No implicit browser storage fallback is used. */
  storage?: CommandOutboxStorage;
}

/**
 * Queue of idempotent commands, not a canonical game store. A command leaves
 * the queue once the server confirms that the command itself is persisted.
 * The resulting move is projected separately from the canonical event log.
 */
export class MatchCommandOutbox {
  private commands: MatchCommand[] = [];
  private flushing: Promise<MatchCommandReceipt[]> | null = null;
  private initialized = false;
  private readonly capacity: number;

  constructor(
    private readonly identity: MatchIdentity,
    private readonly options: CommandOutboxOptions = {},
  ) {
    this.capacity = options.capacity ?? 1;
    if (
      !Number.isSafeInteger(this.capacity) ||
      this.capacity < 1 ||
      this.capacity > 32
    ) {
      throw new Error("La capacité de l'outbox est invalide.");
    }
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const restored = this.options.storage
      ? await this.options.storage.load(this.identity)
      : [];
    for (const command of restored) {
      if (!sameMatchIdentity(command.identity, this.identity)) {
        throw new Error("Une commande restaurée appartient à un autre match.");
      }
    }
    if (restored.length > this.capacity) {
      throw new Error("L'outbox restaurée dépasse sa capacité autorisée.");
    }
    this.commands = [...restored];
    this.initialized = true;
  }

  get pending(): readonly MatchCommand[] {
    return this.commands;
  }

  async enqueue(command: MatchCommand): Promise<void> {
    await this.initialize();
    assertCompatibleMatchIdentity(this.identity, command.identity);
    if (
      this.commands.some(
        (item) => item.clientCommandId === command.clientCommandId,
      )
    ) {
      return;
    }
    if (this.commands.length >= this.capacity) {
      throw new Error(
        "Une commande attend déjà la confirmation du serveur; jeu spéculatif refusé.",
      );
    }
    this.commands.push(command);
    await this.persist();
  }

  async flush(
    submit: (command: MatchCommand) => Promise<MatchCommandReceipt>,
  ): Promise<MatchCommandReceipt[]> {
    await this.initialize();
    if (this.flushing) return this.flushing;

    this.flushing = (async () => {
      const receipts: MatchCommandReceipt[] = [];
      while (this.commands.length > 0) {
        const command = this.commands[0];
        const receipt = await submit(command);
        if (receipt.clientCommandId !== command.clientCommandId) {
          throw new Error(
            "Le serveur n'a pas confirmé l'identifiant idempotent attendu.",
          );
        }
        const invalidRevision =
          receipt.authoritativeRevision < command.expectedRevision ||
          (receipt.status === "pending" &&
            receipt.authoritativeRevision !== command.expectedRevision);
        if (invalidRevision) {
          throw new Error(
            "La confirmation serveur ne correspond pas à la commande en attente.",
          );
        }
        this.commands.shift();
        await this.persist();
        receipts.push(receipt);
      }
      return receipts;
    })();

    try {
      return await this.flushing;
    } finally {
      this.flushing = null;
    }
  }

  private async persist(): Promise<void> {
    if (this.options.storage) {
      await this.options.storage.save(this.identity, this.commands);
    }
  }
}

export class MemoryCommandOutboxStorage implements CommandOutboxStorage {
  private readonly values = new Map<string, MatchCommand[]>();

  async load(identity: MatchIdentity): Promise<MatchCommand[]> {
    return [...(this.values.get(identity.matchId) ?? [])];
  }

  async save(
    identity: MatchIdentity,
    commands: readonly MatchCommand[],
  ): Promise<void> {
    this.values.set(identity.matchId, [...commands]);
  }
}
