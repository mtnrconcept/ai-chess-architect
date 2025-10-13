import type { Application } from "pixi.js";

export type FxIntent =
  | {
      intent: "object.spawn";
      kind: "mine" | "totem" | "beacon";
      style?: FxStyle;
    }
  | {
      intent: "area.hazard";
      kind: "mine-radius" | "field";
      radius: number;
      style?: FxStyle;
    }
  | {
      intent: "combat.explosion" | "combat.hit" | "combat.freeze" | "combat.burn";
      power?: "small" | "medium" | "large";
      style?: FxStyle;
    }
  | {
      intent: "space.warp";
      mode?: "blink" | "portal";
      style?: FxStyle;
    }
  | {
      intent: "viz.hologram" | "viz.scan" | "viz.highlight";
      style?: FxStyle;
    }
  | {
      intent: "piece.trail";
      color?: string;
      duration?: number;
      style?: FxStyle;
    }
  | {
      intent: string;
      [key: string]: unknown;
    };

export type FxStyle = {
  color?: string;
  glow?: string | number;
  holo?: boolean;
  blink?: boolean;
  ring?: boolean;
  pulse?: boolean;
  sparks?: boolean;
  smoke?: "none" | "light" | "heavy";
  [key: string]: unknown;
};

export type FxPayload = Record<string, unknown> & {
  cell?: string;
  fromCell?: string;
  toCell?: string;
  path?: string[];
};

export type FxContext = {
  app: Application;
  layer: {
    ui: HTMLElement;
  };
  toCellPos: (cell: string) => { x: number; y: number };
};
