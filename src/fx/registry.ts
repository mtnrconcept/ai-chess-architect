import gsap from "gsap";
import {
  Application,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import { isTrustedRuleAssetUrl } from "@/rule-presentation/manifest";
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
  // Glow filter temporarily disabled for compatibility
  return null;
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
  halo.lineStyle(
    2,
    style?.glow ? parseInt(style.glow.replace("#", ""), 16) : 0x76e0ff,
    0.85,
  );
  halo.drawCircle(0, 0, 16);
  group.addChild(halo);

  if (style?.holo) {
    const holo = new Graphics();
    holo.lineStyle(1, 0x76e0ff, 0.65).drawCircle(0, 0, 20);
    // holo.filters = [buildGlowFilter()];
    group.addChild(holo);
    gsap.to(holo, {
      rotation: Math.PI * 2,
      repeat: -1,
      duration: 6,
      ease: "linear",
    });
  }

  group.alpha = 0;
  ctx.app.stage.addChild(group);
  gsap.to(group, { alpha: 1, duration: 0.25, ease: "power2.out" });
  if (style?.blink) {
    gsap.to(group, {
      alpha: 0.4,
      duration: 0.8,
      yoyo: true,
      repeat: -1,
      ease: "sine.inOut",
    });
  }

  return group;
}

function areaHazard(
  ctx: FxContext,
  payload: FxPayload,
  radiusCells: number,
  style?: any,
) {
  const { x, y } = toPixel(ctx, payload.cell);
  const ring = new Graphics();
  ring.position.set(x, y);
  ring.lineStyle(
    2,
    style?.glow ? parseInt(style.glow.replace("#", ""), 16) : 0x76e0ff,
    0.6,
  );
  ring.drawCircle(0, 0, radiusCells * 40);
  ctx.app.stage.addChild(ring);

  if (style?.pulse) {
    gsap.to(ring.scale, {
      x: 1.1,
      y: 1.1,
      yoyo: true,
      repeat: -1,
      duration: 1.4,
      ease: "sine.inOut",
    });
  }

  return ring;
}

function explosionFx(
  ctx: FxContext,
  payload: FxPayload,
  power: "small" | "medium" | "large" = "medium",
  style?: any,
) {
  const { x, y } = toPixel(ctx, payload.cell);
  const root = new Container();
  root.position.set(x, y);
  ctx.app.stage.addChild(root);

  const burst = new Graphics();
  burst.alpha = 0.3;
  root.addChild(burst);

  const radius = power === "large" ? 80 : power === "medium" ? 58 : 42;
  const color = style?.color
    ? parseInt(style.color.replace("#", ""), 16)
    : 0xff6a00;

  const animData = { val: 0 };
  gsap.to(animData, {
    val: radius,
    duration: 0.5,
    ease: "power2.out",
    onUpdate() {
      const r = animData.val;
      burst.clear();
      burst.beginFill(color, 0.12).drawCircle(0, 0, r * 0.6).endFill();
      burst.lineStyle(4, color, 0.9).drawCircle(0, 0, r);
    },
  });

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
    smoke
      .beginFill(0x2f2f32, style.smoke === "heavy" ? 0.4 : 0.25)
      .drawCircle(0, 0, radius * 1.4)
      .endFill();
    smoke.alpha = 0;
    root.addChild(smoke);
    gsap.to(smoke, { alpha: 1, duration: 0.3 });
    gsap.to(smoke.scale, {
      x: 1.2,
      y: 1.2,
      duration: 1.5,
      ease: "sine.out",
    });
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

  const color = style?.color
    ? parseInt(style.color.replace("#", ""), 16)
    : 0x76e0ff;

  const ringData = { radius: 5 };
  gsap.to(ringData, {
    radius: 48,
    duration: 0.35,
    ease: "expo.out",
    onUpdate() {
      ring.clear();
      ring.lineStyle(4, color, 1).drawCircle(0, 0, ringData.radius);
    },
  });
  gsap.to(ring, {
    alpha: 0,
    duration: 0.35,
    ease: "sine.in",
    delay: 0.1,
  });

  const arrive = new Graphics();
  arrive.position.set(to.x, to.y);
  arrive.lineStyle(2, color, 1).drawCircle(0, 0, 12);
  ctx.app.stage.addChild(arrive);
  gsap.fromTo(
    arrive.scale,
    { x: 0.2, y: 0.2 },
    { x: 1.2, y: 1.2, duration: 0.35, ease: "expo.out" },
  );
  gsap.to(arrive, {
    alpha: 0,
    duration: 0.35,
    delay: 0.3,
    onComplete: () => arrive.destroy(),
  });

  gsap.delayedCall(0.6, () => ring.destroy());
}

function hologramFx(ctx: FxContext, payload: FxPayload, style?: any) {
  const { x, y } = toPixel(ctx, payload.cell);
  const holo = new Graphics();
  holo.position.set(x, y);
  holo.lineStyle(
    1,
    style?.color ? parseInt(style.color.replace("#", ""), 16) : 0x00f1ff,
    0.65,
  );
  holo.drawRoundedRect(-24, -24, 48, 48, 8);
  // holo.filters = [buildGlowFilter()];
  ctx.app.stage.addChild(holo);
  gsap.to(holo, {
    alpha: 0.35,
    duration: 0.4,
    yoyo: true,
    repeat: 4,
    ease: "sine.inOut",
  });
  gsap.delayedCall(2.2, () => holo.destroy());
}

function trailFx(ctx: FxContext, payload: FxPayload, style?: any) {
  const path = Array.isArray(payload.path)
    ? payload.path
    : payload.fromCell && payload.toCell
      ? [payload.fromCell, payload.toCell]
      : [];
  if (path.length < 2) return;
  const container = new Container();
  const color = style?.color
    ? parseInt(style.color.replace("#", ""), 16)
    : 0x76e0ff;

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
  gsap.to(container, {
    alpha: 0,
    duration: style?.duration ?? 0.8,
    delay: 0.15,
    onComplete: () => container.destroy({ children: true }),
  });
}

const fallbackGlyph = (preset: string): string => {
  switch (preset) {
    case "dragon-carry":
      return "🐉";
    case "spectral-carry":
      return "👻";
    case "impact":
      return "💥";
    case "portal":
      return "🌀";
    case "trail":
      return "✦";
    default:
      return "✨";
  }
};

const chessGlyph = (pieceType: unknown, color: unknown): string => {
  const black = color === "black";
  const glyphs: Record<string, [string, string]> = {
    king: ["♔", "♚"],
    queen: ["♕", "♛"],
    rook: ["♖", "♜"],
    bishop: ["♗", "♝"],
    knight: ["♘", "♞"],
    pawn: ["♙", "♟"],
  };
  if (typeof pieceType !== "string" || !(pieceType in glyphs)) return "♟";
  return glyphs[pieceType][black ? 1 : 0];
};

const finiteNumber = (
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;

function cinematicSpriteFx(
  ctx: FxContext,
  payload: FxPayload,
  intent: Extract<FxIntent, { intent: string }>,
) {
  const tile =
    typeof payload.cell === "string"
      ? payload.cell
      : typeof payload.toCell === "string"
        ? payload.toCell
        : null;
  if (!tile) return;

  const preset = typeof intent.preset === "string" ? intent.preset : "burst";
  const direction =
    typeof intent.direction === "string"
      ? intent.direction
      : "left-to-right";
  const durationMs = finiteNumber(intent.durationMs, 1600, 200, 5000);
  const scale = finiteNumber(intent.scale, 1, 0.25, 4);
  const zIndex = Math.round(finiteNumber(intent.zIndex, 12, 1, 20));
  const trustedUrl = isTrustedRuleAssetUrl(intent.assetUrl)
    ? intent.assetUrl
    : null;
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const target = toPixel(ctx, tile);
  const boardWidth = Math.max(1, ctx.layer.ui.clientWidth);
  const boardHeight = Math.max(1, ctx.layer.ui.clientHeight);
  const baseSize = Math.min(190, Math.max(72, boardWidth / 3.4));

  const root = document.createElement("div");
  root.setAttribute("aria-hidden", "true");
  root.style.position = "absolute";
  root.style.left = "0";
  root.style.top = "0";
  root.style.width = `${baseSize}px`;
  root.style.height = `${baseSize}px`;
  root.style.pointerEvents = "none";
  root.style.zIndex = String(zIndex);
  root.style.transformOrigin = "center";
  root.style.willChange = "transform, opacity";
  root.style.filter = "drop-shadow(0 12px 18px rgba(0,0,0,.45))";

  const fallback = document.createElement("span");
  fallback.textContent = fallbackGlyph(preset);
  fallback.style.position = "absolute";
  fallback.style.inset = "0";
  fallback.style.display = "grid";
  fallback.style.placeItems = "center";
  fallback.style.fontSize = `${Math.round(baseSize * 0.72)}px`;
  fallback.style.lineHeight = "1";
  root.appendChild(fallback);

  if (trustedUrl) {
    const image = document.createElement("img");
    image.src = trustedUrl;
    image.alt = "";
    image.decoding = "async";
    image.loading = "eager";
    image.referrerPolicy = "no-referrer";
    image.crossOrigin = "anonymous";
    image.draggable = false;
    image.style.position = "absolute";
    image.style.inset = "0";
    image.style.width = "100%";
    image.style.height = "100%";
    image.style.objectFit = "contain";
    image.style.borderRadius = "22%";
    image.style.opacity = "0";
    image.addEventListener(
      "load",
      () => {
        image.style.opacity = "1";
        fallback.style.opacity = "0";
      },
      { once: true },
    );
    image.addEventListener(
      "error",
      () => {
        image.remove();
        fallback.style.opacity = "1";
      },
      { once: true },
    );
    root.appendChild(image);
  }

  if (preset.endsWith("carry")) {
    const captured = document.createElement("span");
    captured.textContent = chessGlyph(
      payload.capturedPieceType,
      payload.capturedPieceColor,
    );
    captured.style.position = "absolute";
    captured.style.left = "50%";
    captured.style.top = "64%";
    captured.style.transform = "translate(-50%, -50%)";
    captured.style.fontSize = `${Math.round(baseSize * 0.24)}px`;
    captured.style.textShadow = "0 4px 8px rgba(0,0,0,.65)";
    root.appendChild(captured);
  }

  ctx.layer.ui.appendChild(root);

  const targetX = target.x - baseSize / 2;
  const targetY = target.y - baseSize / 2;
  const start = { x: -baseSize, y: targetY };
  const end = { x: boardWidth + baseSize, y: targetY - baseSize * 0.35 };

  switch (direction) {
    case "right-to-left":
      start.x = boardWidth + baseSize;
      end.x = -baseSize;
      break;
    case "top-to-bottom":
      start.x = targetX;
      start.y = -baseSize;
      end.x = targetX + baseSize * 0.25;
      end.y = boardHeight + baseSize;
      break;
    case "bottom-to-top":
      start.x = targetX;
      start.y = boardHeight + baseSize;
      end.x = targetX + baseSize * 0.25;
      end.y = -baseSize;
      break;
    case "center-out":
      start.x = targetX;
      start.y = targetY;
      end.x = targetX + baseSize * 0.8;
      end.y = targetY - baseSize * 0.8;
      break;
    default:
      break;
  }

  if (reducedMotion) {
    gsap.set(root, {
      x: targetX,
      y: targetY,
      scale: Math.min(scale, 1.25),
      opacity: 0,
    });
    gsap.to(root, {
      opacity: 1,
      duration: 0.12,
      yoyo: true,
      repeat: 1,
      repeatDelay: 0.18,
      onComplete: () => root.remove(),
    });
    return;
  }

  const totalSeconds = durationMs / 1000;
  const arrivalSeconds = Math.max(0.12, totalSeconds * 0.38);
  const pauseSeconds = Math.min(0.28, totalSeconds * 0.14);
  const departureSeconds = Math.max(
    0.12,
    totalSeconds - arrivalSeconds - pauseSeconds,
  );
  const flip = direction === "right-to-left" ? -1 : 1;

  gsap.set(root, {
    x: start.x,
    y: start.y,
    scaleX: scale * flip,
    scaleY: scale,
    opacity: 0,
    rotation: direction === "top-to-bottom" ? 12 : -5,
  });
  const timeline = gsap.timeline({
    defaults: { overwrite: true },
    onComplete: () => root.remove(),
  });
  timeline.to(root, {
    x: targetX,
    y: targetY,
    opacity: 1,
    rotation: 0,
    duration: arrivalSeconds,
    ease: "power3.out",
  });
  timeline.to(root, {
    scaleX: scale * flip * 1.08,
    scaleY: scale * 1.08,
    duration: pauseSeconds / 2,
    yoyo: true,
    repeat: 1,
    ease: "sine.inOut",
  });
  timeline.to(root, {
    x: end.x,
    y: end.y,
    opacity: 0,
    rotation: direction === "right-to-left" ? -8 : 8,
    duration: departureSeconds,
    ease: "power2.in",
  });
}

export async function resolveFx(
  intent: FxIntent,
  ctx: FxContext,
  payload: FxPayload,
) {
  switch (intent.intent) {
    case "object.spawn":
      if (intent.kind === "mine") spawnMine(ctx, payload, intent.style);
      break;
    case "area.hazard":
      if (intent.kind === "mine-radius")
        areaHazard(ctx, payload, Number(intent.radius) || 1, intent.style);
      break;
    case "combat.explosion":
      explosionFx(
        ctx,
        payload,
        (intent.power as "large" | "medium" | "small") ?? "medium",
        intent.style,
      );
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
    case "presentation.sprite":
      cinematicSpriteFx(ctx, payload, intent);
      break;
    default:
      break;
  }
}
