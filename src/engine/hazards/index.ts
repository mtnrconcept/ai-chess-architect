import { slugify } from "@/features/rules-pipeline/utils/slugify";

export type HazardEffect = {
  action: string;
  params?: Record<string, unknown>;
};

export type HazardTriggerSet = {
  onEnter?: HazardEffect[];
  onStay?: HazardEffect[];
  onTick?: HazardEffect[];
  onExpire?: HazardEffect[];
  onExplode?: HazardEffect[];
};

export type HazardSpec = {
  id?: string;
  type: string;
  tile?: string;
  area?: string[];
  ttl?: number;
  payload?: Record<string, unknown>;
  triggers?: HazardTriggerSet;
};

export type HazardState = HazardSpec & {
  id: string;
  tiles: string[];
  ttl?: number;
  createdAtTurn: number;
};

export type HazardResolution = {
  hazardId: string;
  trigger: "enter" | "stay" | "tick" | "expire" | "explode";
  effects: HazardEffect[];
};

export class HazardManager {
  private hazards = new Map<string, HazardState>();
  private turn = 0;
  private counter = 0;

  spawn(spec: HazardSpec): HazardState {
    if (!spec.tile && (!spec.area || spec.area.length === 0)) {
      throw new Error("Un hazard doit définir tile ou area.");
    }
    const id = spec.id ?? `haz_${slugify(`${spec.type}_${this.counter++}`)}`;
    const tiles = spec.area ? [...spec.area] : spec.tile ? [spec.tile] : [];
    const state: HazardState = {
      ...spec,
      id,
      tiles,
      ttl: spec.ttl,
      triggers: spec.triggers ?? {},
      createdAtTurn: this.turn,
    };
    this.hazards.set(id, state);
    return state;
  }

  get(id: string): HazardState | undefined {
    return this.hazards.get(id);
  }

  getHazardsAt(tile: string): HazardState[] {
    return Array.from(this.hazards.values()).filter((hazard) =>
      hazard.tiles.includes(tile),
    );
  }

  advanceTurn(): void {
    this.turn += 1;
  }

  tick(): HazardResolution[] {
    const resolutions: HazardResolution[] = [];
    for (const hazard of this.hazards.values()) {
      if (hazard.ttl === undefined) continue;
      hazard.ttl -= 1;
      if ((hazard.triggers?.onTick?.length ?? 0) > 0) {
        resolutions.push({
          hazardId: hazard.id,
          trigger: "tick",
          effects: hazard.triggers?.onTick ?? [],
        });
      }
      if (hazard.ttl !== undefined && hazard.ttl <= 0) {
        resolutions.push({
          hazardId: hazard.id,
          trigger: "expire",
          effects: hazard.triggers?.onExpire ?? [],
        });
        this.hazards.delete(hazard.id);
      }
    }
    return resolutions;
  }

  handleEnter(tile: string): HazardResolution[] {
    const hazards = this.getHazardsAt(tile);
    return hazards
      .filter((hazard) => (hazard.triggers?.onEnter?.length ?? 0) > 0)
      .map((hazard) => ({
        hazardId: hazard.id,
        trigger: "enter" as const,
        effects: hazard.triggers?.onEnter ?? [],
      }));
  }

  handleStay(tile: string): HazardResolution[] {
    const hazards = this.getHazardsAt(tile);
    return hazards
      .filter((hazard) => (hazard.triggers?.onStay?.length ?? 0) > 0)
      .map((hazard) => ({
        hazardId: hazard.id,
        trigger: "stay" as const,
        effects: hazard.triggers?.onStay ?? [],
      }));
  }

  explode(id: string, radius: number): HazardResolution {
    const hazard = this.hazards.get(id);
    if (!hazard) {
      throw new Error(`Hazard ${id} introuvable pour explosion.`);
    }
    this.hazards.delete(id);
    const effects = hazard.triggers?.onExplode ?? [
      {
        action: "hazard.explode",
        params: { hazardId: id, radius },
      },
    ];
    return {
      hazardId: id,
      trigger: "explode",
      effects,
    };
  }

  remove(id: string): void {
    this.hazards.delete(id);
  }

  serialize(): string {
    return JSON.stringify({
      turn: this.turn,
      counter: this.counter,
      hazards: Array.from(this.hazards.values()),
    });
  }

  static deserialize(payload: string): HazardManager {
    const parsed = JSON.parse(payload) as {
      turn: number;
      counter: number;
      hazards: HazardState[];
    };
    const manager = new HazardManager();
    manager.turn = parsed.turn;
    manager.counter = parsed.counter;
    parsed.hazards.forEach((hazard) => manager.hazards.set(hazard.id, hazard));
    return manager;
  }
}
