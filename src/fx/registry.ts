import gsap from "gsap";
import {
  Application,
  BLEND_MODES,
  Container,
  Graphics,
  Sprite,
  Texture,
  filters,
} from "pixi.js";
import type { FxContext, FxIntent, FxPayload } from "./types";

const random = (min: number, max: number) => Math.random() * (max - min) + min;

const ensureParticleTexture = (() => {
  let cache: Texture | null = null;
  return (app: Application) => {
    if (cache) return cache;
    const g = new Graphics();
    g.beginFill(0xffffff);
    g.drawCircle(0, 0, 8);
    g.endFill();
    cache = app.renderer.generateTexture(g);
    g.destroy();
    return cache;
  };
})();

const buildGlowFilter = () => {
  const glow = new filters.GlowFilter({
    distance: 25,
    outerStrength: 2,
    innerStrength: 0,
    color: 0x76e0ff,
    quality: 0.2,
  });
  return glow;
};

function toPixel(ctx: FxContext, cell?: string) {
  if (!cell) return { x: 0, y: 0 };
  return ctx.toCellPos(cell);
}

function spawnMine(ctx: FxContext, payload: FxPayload, style?: any) {
  const { x, y } = toPixel(ctx, payload.cell);
  const group = new Container();
  group.position.set(x, y);

  const core = new Graphics();
  core.beginFill(0x101820).drawCircle(0, 0, 12).endFill();
  group.addChild(core);

  const halo = new Graphics();
  halo.lineStyle(2, style?.glow ? parseInt(style.glow.replace("#", ""), 16) : 0x76e0ff, 0.85);
  halo.drawCircle(0, 0, 16);
  group.addChild(halo);

  if (style?.holo) {
    const holo = new Graphics();
    holo.lineStyle(1, 0x76e0ff, 0.65).drawCircle(0, 0, 20);
    holo.filters = [buildGlowFilter()];
    group.addChild(holo);
    gsap.to(holo, { rotation: Math.PI * 2, repeat: -1, duration: 6, ease: "linear" });
  }

  group.alpha = 0;
  ctx.app.stage.addChild(group);
  gsap.to(group, { alpha: 1, duration: 0.25, ease: "power2.out" });
  if (style?.blink) {
    gsap.to(group, { alpha: 0.4, duration: 0.8, yoyo: true, repeat: -1, ease: "sine.inOut" });
  }

  return group;
}

function areaHazard(ctx: FxContext, payload: FxPayload, radiusCells: number, style?: any) {
  const { x, y } = toPixel(ctx, payload.cell);
  const ring = new Graphics();
  ring.position.set(x, y);
  ring.lineStyle(2, style?.glow ? parseInt(style.glow.replace("#", ""), 16) : 0x76e0ff, 0.6);
  ring.drawCircle(0, 0, radiusCells * 40);
  ctx.app.stage.addChild(ring);

  if (style?.pulse) {
    gsap.to(ring.scale, { x: 1.1, y: 1.1, yoyo: true, repeat: -1, duration: 1.4, ease: "sine.inOut" });
  }

  return ring;
}

function explosionFx(ctx: FxContext, payload: FxPayload, power: "small" | "medium" | "large" = "medium", style?: any) {
  const { x, y } = toPixel(ctx, payload.cell);
  const root = new Container();
  root.position.set(x, y);
  ctx.app.stage.addChild(root);

  const burst = new Graphics();
  burst.blendMode = BLEND_MODES.ADD;
  root.addChild(burst);

  const radius = power === "large" ? 80 : power === "medium" ? 58 : 42;
  const color = style?.color ? parseInt(style.color.replace("#", ""), 16) : 0xff6a00;

  gsap.fromTo(
    { val: 0 },
    {
      val: radius,
      duration: 0.5,
      ease: "power2.out",
      onUpdate(self) {
        const r = self.targets()[0].val;
        burst.clear();
        burst.beginFill(color, 0.12).drawCircle(0, 0, r * 0.6).endFill();
        burst.lineStyle(4, color, 0.9).drawCircle(0, 0, r);
      },
    },
  );

  const texture = ensureParticleTexture(ctx.app);
  const sparkCount = style?.sparks === false ? 0 : 28;
  for (let i = 0; i < sparkCount; i++) {
    const sprite = new Sprite(texture);
    sprite.tint = color;
    sprite.alpha = 0.9;
    sprite.scale.set(0.25 + Math.random() * 0.3);
    root.addChild(sprite);
    const angle = (i / sparkCount) * Math.PI * 2 + random(-0.2, 0.2);
    const dist = radius * random(0.6, 1.1);
    gsap.to(sprite, {
      x: Math.cos(angle) * dist,
      y: Math.sin(angle) * dist,
      alpha: 0,
      duration: 0.45 + Math.random() * 0.25,
      ease: "power2.out",
    });
  }

  if (style?.smoke && style.smoke !== "none") {
    const smoke = new Graphics();
    smoke.beginFill(0x2f2f32, style.smoke === "heavy" ? 0.4 : 0.25).drawCircle(0, 0, radius * 1.4).endFill();
    smoke.alpha = 0;
    root.addChild(smoke);
    gsap.to(smoke, { alpha: 1, duration: 0.3 });
    gsap.to(smoke.scale, { x: 1.2, y: 1.2, duration: 1.5, ease: "sine.out" });
    gsap.to(smoke, { alpha: 0, duration: 0.6, delay: 0.9 });
  }

  gsap.delayedCall(1.3, () => {
    root.destroy({ children: true });
  });
}

function warpFx(ctx: FxContext, payload: FxPayload, style?: any) {
  const from = toPixel(ctx, payload.fromCell);
  const to = toPixel(ctx, payload.toCell);
  const ring = new Graphics();
  ring.position.set(from.x, from.y);
  ctx.app.stage.addChild(ring);

  const color = style?.color ? parseInt(style.color.replace("#", ""), 16) : 0x76e0ff;

  gsap.fromTo(
    { radius: 5 },
    {
      radius: 48,
      duration: 0.35,
      ease: "expo.out",
      onUpdate(self) {
        ring.clear();
        ring.lineStyle(4, color, 1).drawCircle(0, 0, self.targets()[0].radius);
      },
    },
  );
  gsap.to(ring, { alpha: 0, duration: 0.35, ease: "sine.in", delay: 0.1 });

  const arrive = new Graphics();
  arrive.position.set(to.x, to.y);
  arrive.lineStyle(2, color, 1).drawCircle(0, 0, 12);
  ctx.app.stage.addChild(arrive);
  gsap.fromTo(arrive.scale, { x: 0.2, y: 0.2 }, { x: 1.2, y: 1.2, duration: 0.35, ease: "expo.out" });
  gsap.to(arrive, { alpha: 0, duration: 0.35, delay: 0.3, onComplete: () => arrive.destroy() });

  gsap.delayedCall(0.6, () => ring.destroy());
}

function hologramFx(ctx: FxContext, payload: FxPayload, style?: any) {
  const { x, y } = toPixel(ctx, payload.cell);
  const holo = new Graphics();
  holo.position.set(x, y);
  holo.lineStyle(1, style?.color ? parseInt(style.color.replace("#", ""), 16) : 0x00f1ff, 0.65);
  holo.drawRoundedRect(-24, -24, 48, 48, 8);
  holo.filters = [buildGlowFilter()];
  ctx.app.stage.addChild(holo);
  gsap.to(holo, { alpha: 0.35, duration: 0.4, yoyo: true, repeat: 4, ease: "sine.inOut" });
  gsap.delayedCall(2.2, () => holo.destroy());
}

function trailFx(ctx: FxContext, payload: FxPayload, style?: any) {
  const path = Array.isArray(payload.path) ? payload.path : payload.fromCell && payload.toCell ? [payload.fromCell, payload.toCell] : [];
  if (path.length < 2) return;
  const container = new Container();
  const color = style?.color ? parseInt(style.color.replace("#", ""), 16) : 0x76e0ff;

  for (let i = 0; i < path.length - 1; i++) {
    const from = ctx.toCellPos(path[i] as string);
    const to = ctx.toCellPos(path[i + 1] as string);
    const g = new Graphics();
    g.lineStyle(4, color, 0.6);
    g.moveTo(from.x, from.y);
    g.lineTo(to.x, to.y);
    container.addChild(g);
  }

  container.alpha = 0;
  ctx.app.stage.addChild(container);
  gsap.to(container, { alpha: 1, duration: 0.15, ease: "power2.out" });
  gsap.to(container, { alpha: 0, duration: style?.duration ?? 0.8, delay: 0.15, onComplete: () => container.destroy({ children: true }) });
}

export async function resolveFx(intent: FxIntent, ctx: FxContext, payload: FxPayload) {
  switch (intent.intent) {
    case "object.spawn":
      if (intent.kind === "mine") spawnMine(ctx, payload, intent.style);
      break;
    case "area.hazard":
      if (intent.kind === "mine-radius") areaHazard(ctx, payload, intent.radius, intent.style);
      break;
    case "combat.explosion":
      explosionFx(ctx, payload, intent.power ?? "medium", intent.style);
      break;
    case "space.warp":
      warpFx(ctx, payload, intent.style);
      break;
    case "viz.hologram":
      hologramFx(ctx, payload, intent.style);
      break;
    case "piece.trail":
      trailFx(ctx, payload, intent.style);
      break;
    default:
      break;
  }
}
