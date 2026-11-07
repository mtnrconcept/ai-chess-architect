import gsap from "gsap";
import { Container, Graphics } from "pixi.js";
import {
  isSupportedFxIntent,
  normalizeFxCell,
  resolveFxColor,
  sanitizeFxDuration,
  sanitizeFxRadius,
} from "./fx-policy";
import type { FxContext, FxIntent, FxPayload, FxStyle } from "./types";

const MAX_ACTIVE_EFFECTS = 48;
const CYAN = 0x67e8f9;
const ORANGE = 0xff8a3d;
const ICE = 0x94f5ff;
const GOLD = 0xffcc66;

type Stoppable = { kill(): void };
type FxRecord = {
  root: Container;
  jobs: Stoppable[];
  cell: string | null;
  persistent: boolean;
};
type FxState = {
  active: Set<FxRecord>;
};
const byApp = new WeakMap<FxContext["app"], FxState>();

const fxState = (ctx: FxContext): FxState => {
  const found = byApp.get(ctx.app);
  if (found) return found;
  const created: FxState = { active: new Set() };
  byApp.set(ctx.app, created);
  return created;
};

const stopEffect = (state: FxState, record: FxRecord): void => {
  if (!state.active.delete(record)) return;
  for (const job of record.jobs) job.kill();
  if (!record.root.destroyed) record.root.destroy({ children: true });
};

const animate = (
  record: FxRecord,
  target: object,
  vars: gsap.TweenVars,
): void => {
  record.jobs.push(gsap.to(target, vars));
};

const lifetime = (state: FxState, record: FxRecord, seconds: number): void => {
  record.jobs.push(gsap.delayedCall(seconds, () => stopEffect(state, record)));
};

const point = (
  ctx: FxContext,
  cell: unknown,
): { x: number; y: number; cell: string } | null => {
  const clean = normalizeFxCell(cell);
  if (!clean) return null;
  const coordinates = ctx.toCellPos(clean);
  if (!Number.isFinite(coordinates.x) || !Number.isFinite(coordinates.y))
    return null;
  return { ...coordinates, cell: clean };
};

const mount = (
  ctx: FxContext,
  at: { x: number; y: number; cell: string },
  persistent = false,
): { record: FxRecord; state: FxState } => {
  const state = fxState(ctx);
  if (persistent) {
    for (const old of [...state.active]) {
      if (old.persistent && old.cell === at.cell) stopEffect(state, old);
    }
  }
  if (state.active.size >= MAX_ACTIVE_EFFECTS) {
    const oldest = state.active.values().next().value;
    if (oldest) stopEffect(state, oldest);
  }
  const root = new Container();
  root.position.set(at.x, at.y);
  ctx.app.stage.addChild(root);
  const record: FxRecord = {
    root,
    jobs: [],
    cell: at.cell,
    persistent,
  };
  state.active.add(record);
  return { state, record };
};

const colorFromGlow = (
  style: FxStyle | undefined,
  fallback: number,
): number => {
  const glow = style?.glow;
  if (
    typeof glow === "number" &&
    Number.isInteger(glow) &&
    glow >= 0 &&
    glow <= 0xffffff
  )
    return glow;
  return resolveFxColor(glow, resolveFxColor(style?.color, fallback));
};

const ring = (
  record: FxRecord,
  radius: number,
  color: number,
  width = 3,
  alpha = 0.85,
): Graphics => {
  const graphic = new Graphics()
    .circle(0, 0, radius)
    .stroke({ width, color, alpha });
  record.root.addChild(graphic);
  return graphic;
};

const disc = (
  record: FxRecord,
  radius: number,
  color: number,
  alpha = 1,
): Graphics => {
  const graphic = new Graphics().circle(0, 0, radius).fill({ color, alpha });
  record.root.addChild(graphic);
  return graphic;
};

const blinkRing = (
  record: FxRecord,
  color: number,
  radius = 24,
  duration = 0.75,
): void => {
  const halo = ring(record, radius, color, 3, 0.85);
  halo.scale.set(0.45);
  animate(record, halo.scale, {
    x: 1.35,
    y: 1.35,
    duration,
    ease: "power2.out",
  });
  animate(record, halo, { alpha: 0, duration, ease: "sine.out" });
};

const sparks = (
  record: FxRecord,
  color: number,
  count: number,
  distance: number,
  duration: number,
): void => {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const particle = disc(record, 2.2 + (i % 3), color, 0.92);
    animate(record, particle, {
      x: Math.cos(angle) * distance * (0.75 + (i % 4) * 0.1),
      y: Math.sin(angle) * distance * (0.75 + (i % 4) * 0.1),
      alpha: 0,
      duration: duration * (0.7 + (i % 3) * 0.12),
      ease: "power2.out",
    });
  }
};

/**
 * Free, GPU-accelerated sand vortex generated from geometry at runtime.
 * No image service, licensing dependency or remote asset is required.
 * All repeating tweens are registered for deterministic cleanup on trap use.
 */
const spawnQuicksand = (
  ctx: FxContext,
  payload: FxPayload,
): void => {
  const at = point(ctx, payload.cell);
  if (!at) return;
  const { record } = mount(ctx, at, true);
  const sand = 0xd9a85b;
  const glow = 0xffe2a1;
  disc(record, 19, 0x46301e, 0.76);
  disc(record, 15, 0x8f602f, 0.68);
  for (let index = 0; index < 4; index += 1) {
    const radius = 7 + index * 4;
    const spiral = new Graphics()
      .arc(0, 0, radius, Math.PI * 0.13, Math.PI * 1.71)
      .stroke({ color: index % 2 === 0 ? glow : sand, width: 2.2 - index * 0.25, alpha: 0.82 });
    spiral.rotation = index * (Math.PI / 3);
    record.root.addChild(spiral);
    animate(record, spiral, {
      rotation: spiral.rotation + (index % 2 === 0 ? 1 : -1) * Math.PI * 2,
      duration: 2.4 + index * 0.7,
      repeat: -1,
      ease: "none",
    });
  }
  for (let index = 0; index < 9; index += 1) {
    const angle = (index / 9) * Math.PI * 2;
    const radius = 13 + (index % 3) * 3;
    const grain = disc(record, 1 + (index % 2), index % 2 ? glow : sand, 0.8);
    grain.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius);
    animate(record, grain, {
      x: Math.cos(angle + Math.PI) * radius,
      y: Math.sin(angle + Math.PI) * radius,
      alpha: 0.25,
      duration: 1.4 + (index % 4) * 0.3,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }
};

const spawnObject = (
  ctx: FxContext,
  payload: FxPayload,
  kind: "mine" | "totem" | "beacon" | "quicksand",
  style?: FxStyle,
): void => {
  if (kind === "quicksand") {
    spawnQuicksand(ctx, payload);
    return;
  }
  const at = point(ctx, payload.cell);
  if (!at) return;
  const { record } = mount(ctx, at, true);
  const color = colorFromGlow(style, kind === "mine" ? ORANGE : CYAN);
  disc(record, 12, 0x0b1525);
  ring(record, 14, color, 2.5);
  disc(record, 6, color, 0.78);
  const pulse = ring(record, kind === "mine" ? 20 : 23, color, 1.2, 0.5);
  animate(record, pulse.scale, {
    x: 1.2,
    y: 1.2,
    yoyo: true,
    repeat: -1,
    duration: 1.25,
    ease: "sine.inOut",
  });
  if (style?.blink) {
    animate(record, record.root, {
      alpha: 0.62,
      yoyo: true,
      repeat: -1,
      duration: 0.85,
      ease: "sine.inOut",
    });
  }
};

const spawnHazard = (
  ctx: FxContext,
  payload: FxPayload,
  radius: number,
  style?: FxStyle,
): void => {
  const at = point(ctx, payload.cell);
  if (!at) return;
  const { record } = mount(ctx, at, true);
  const color = colorFromGlow(style, ORANGE);
  ring(record, sanitizeFxRadius(radius) * 38, color, 2, 0.7);
  if (style?.pulse) {
    animate(record, record.root.scale, {
      x: 1.07,
      y: 1.07,
      repeat: -1,
      yoyo: true,
      duration: 1.4,
      ease: "sine.inOut",
    });
  }
};

const burstFx = (
  ctx: FxContext,
  payload: FxPayload,
  style?: FxStyle,
  kind: "explosion" | "hit" | "freeze" | "burn" = "explosion",
  power: "small" | "medium" | "large" = "medium",
): void => {
  const at = point(ctx, payload.cell ?? payload.toCell);
  if (!at) return;
  const { record, state } = mount(ctx, at);
  const color = colorFromGlow(
    style,
    kind === "freeze"
      ? ICE
      : kind === "burn"
        ? ORANGE
        : kind === "hit"
          ? GOLD
          : ORANGE,
  );
  const radius = power === "large" ? 48 : power === "small" ? 22 : 34;
  const glow = disc(record, kind === "hit" ? 10 : 17, color, 0.2);
  glow.scale.set(0.4);
  animate(record, glow.scale, { x: 2, y: 2, duration: 0.38, ease: "expo.out" });
  animate(record, glow, { alpha: 0, duration: 0.45 });
  blinkRing(record, color, radius, kind === "freeze" ? 0.9 : 0.55);
  if (kind === "freeze" || kind === "burn") {
    const second = ring(record, radius * 0.55, color, 2, 0.65);
    second.rotation = Math.PI / 4;
    animate(record, second.scale, { x: 1.6, y: 1.6, duration: 0.85 });
    animate(record, second, { alpha: 0, duration: 0.85 });
  }
  const count =
    style?.sparks === false
      ? 0
      : kind === "explosion"
        ? 18
        : kind === "hit"
          ? 8
          : 12;
  if (count)
    sparks(record, color, count, radius * 2, kind === "freeze" ? 0.85 : 0.55);
  lifetime(state, record, kind === "freeze" ? 1.1 : 0.9);
};

const portalFx = (
  ctx: FxContext,
  payload: FxPayload,
  style?: FxStyle,
): void => {
  const at = point(ctx, payload.toCell ?? payload.cell ?? payload.fromCell);
  if (!at) return;
  const { record, state } = mount(ctx, at);
  const color = colorFromGlow(style, CYAN);
  for (let i = 0; i < 3; i += 1) {
    const halo = ring(record, 12 + i * 9, color, 2.2 - i * 0.4, 0.85);
    halo.scale.set(0.35);
    animate(record, halo.scale, {
      x: 1.3,
      y: 1.3,
      duration: 0.55 + i * 0.12,
      delay: i * 0.08,
      ease: "expo.out",
    });
    animate(record, halo, { alpha: 0, duration: 0.58, delay: i * 0.08 });
  }
  lifetime(state, record, 0.95);
};

const hologramFx = (
  ctx: FxContext,
  payload: FxPayload,
  style?: FxStyle,
  mode: "hologram" | "scan" | "highlight" = "hologram",
): void => {
  const at = point(ctx, payload.cell ?? payload.toCell);
  if (!at) return;
  const { record, state } = mount(ctx, at);
  const color = colorFromGlow(style, mode === "highlight" ? GOLD : CYAN);
  const frame = new Graphics()
    .roundRect(-24, -24, 48, 48, 7)
    .stroke({ width: mode === "highlight" ? 4 : 2, color, alpha: 0.9 });
  record.root.addChild(frame);
  if (mode === "scan") {
    const scanner = new Graphics()
      .moveTo(-20, -20)
      .lineTo(20, -20)
      .stroke({ width: 2, color, alpha: 1 });
    record.root.addChild(scanner);
    animate(record, scanner, { y: 40, duration: 0.95, ease: "power1.inOut" });
  } else {
    animate(record, frame.scale, {
      x: 1.16,
      y: 1.16,
      duration: 0.65,
      ease: "sine.out",
    });
  }
  animate(record, frame, {
    alpha: 0,
    duration: mode === "highlight" ? 1.2 : 0.95,
  });
  lifetime(state, record, mode === "highlight" ? 1.35 : 1.15);
};

const trailFx = (ctx: FxContext, payload: FxPayload, style?: FxStyle): void => {
  const candidates = Array.isArray(payload.path)
    ? payload.path
    : [payload.fromCell, payload.toCell];
  const tiles = candidates
    .slice(0, 16)
    .map((tile) => point(ctx, tile))
    .filter((tile): tile is NonNullable<typeof tile> => tile !== null);
  if (tiles.length < 2) return;
  const { record, state } = mount(ctx, tiles[0]);
  const graphic = new Graphics();
  record.root.addChild(graphic);
  const color = colorFromGlow(style, CYAN);
  graphic.moveTo(0, 0);
  for (const tile of tiles.slice(1)) {
    graphic.lineTo(tile.x - tiles[0].x, tile.y - tiles[0].y);
  }
  graphic.stroke({ width: 4, color, alpha: 0.75, cap: "round", join: "round" });
  const duration = sanitizeFxDuration(style?.duration);
  animate(record, graphic, { alpha: 0, duration, delay: 0.1 });
  lifetime(state, record, duration + 0.2);
};

export function clearFxAtCell(ctx: FxContext, tile: unknown): void {
  const cell = normalizeFxCell(tile);
  if (!cell) return;
  const state = byApp.get(ctx.app);
  if (!state) return;
  for (const record of [...state.active]) {
    if (record.persistent && record.cell === cell) stopEffect(state, record);
  }
}

export function disposeFxForApp(app: FxContext["app"]): void {
  const state = byApp.get(app);
  if (!state) return;
  for (const record of [...state.active]) stopEffect(state, record);
  byApp.delete(app);
}

/** Animations are cosmetic only; board state remains authoritative in RuleEngine. */
export async function resolveFx(
  intent: FxIntent,
  ctx: FxContext,
  payload: FxPayload,
): Promise<void> {
  if (intent.intent === "object.clear") {
    clearFxAtCell(ctx, payload.cell);
    return;
  }
  if (!isSupportedFxIntent(intent.intent)) return;
  if (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches
  )
    return;

  const style: FxStyle | undefined =
    intent.style !== null &&
    typeof intent.style === "object" &&
    !Array.isArray(intent.style)
      ? (intent.style as FxStyle)
      : undefined;

  switch (intent.intent) {
    case "object.spawn": {
      const kind =
        intent.kind === "totem" || intent.kind === "beacon" || intent.kind === "quicksand"
          ? intent.kind
          : "mine";
      spawnObject(ctx, payload, kind, style);
      return;
    }
    case "area.hazard":
      spawnHazard(
        ctx,
        payload,
        typeof intent.radius === "number" ? intent.radius : 1,
        style,
      );
      return;
    case "combat.explosion":
    case "combat.hit":
    case "combat.freeze":
    case "combat.burn":
      burstFx(
        ctx,
        payload,
        style,
        intent.intent.slice("combat.".length) as
          | "explosion"
          | "hit"
          | "freeze"
          | "burn",
        intent.power === "small" || intent.power === "large"
          ? intent.power
          : "medium",
      );
      return;
    case "space.warp":
      portalFx(ctx, payload, style);
      return;
    case "viz.hologram":
    case "viz.scan":
    case "viz.highlight":
      hologramFx(
        ctx,
        payload,
        style,
        intent.intent.slice("viz.".length) as "hologram" | "scan" | "highlight",
      );
      return;
    case "piece.trail":
      trailFx(ctx, payload, style);
      return;
    default:
      return;
  }
}
