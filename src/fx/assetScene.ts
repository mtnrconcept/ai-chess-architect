import gsap from "gsap";
import { Assets, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { FxContext, FxPayload } from "./types";
import {
  getRuleSceneAsset,
  type RuleSceneAsset,
} from "./ruleAssetCatalog";

const RULE_SCENE_ID_PATTERN = /^scene\.[a-z0-9][a-z0-9.-]{2,63}$/;

const hashScene = (sceneId: string): number => {
  let value = 2166136261;
  for (const char of sceneId) {
    value ^= char.charCodeAt(0);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
};

const addCredit = (
  ctx: FxContext,
  asset: RuleSceneAsset | null,
): (() => void) => {
  if (!asset?.attribution) return () => undefined;
  const credit = document.createElement("div");
  credit.textContent = `${asset.attribution} • Openverse`;
  credit.setAttribute("role", "note");
  credit.style.position = "absolute";
  credit.style.right = "8px";
  credit.style.bottom = "8px";
  credit.style.maxWidth = "70%";
  credit.style.padding = "4px 7px";
  credit.style.borderRadius = "6px";
  credit.style.background = "rgba(0, 0, 0, 0.72)";
  credit.style.color = "white";
  credit.style.fontSize = "10px";
  credit.style.lineHeight = "1.25";
  credit.style.pointerEvents = "none";
  credit.style.zIndex = "12";
  credit.style.opacity = "0";
  ctx.layer.ui.appendChild(credit);
  requestAnimationFrame(() => {
    credit.style.transition = "opacity 160ms ease";
    credit.style.opacity = "1";
  });

  return () => {
    credit.style.opacity = "0";
    window.setTimeout(() => credit.remove(), 180);
  };
};

const buildProceduralDragon = (sceneId: string): Container => {
  const dragon = new Container();
  const seed = hashScene(sceneId);
  const primary = 0x3aa76d + (seed % 0x202020);
  const secondary = 0xffc857;

  const tail = new Graphics();
  tail.lineStyle(8, primary, 1);
  tail.moveTo(-34, 8);
  tail.bezierCurveTo(-72, 18, -76, 52, -112, 30);
  dragon.addChild(tail);

  const leftWing = new Graphics();
  leftWing.beginFill(primary, 0.9);
  leftWing.drawPolygon([-18, -4, -74, -58, -55, 8, -18, 24]);
  leftWing.endFill();
  leftWing.name = "left-wing";
  dragon.addChild(leftWing);

  const rightWing = new Graphics();
  rightWing.beginFill(primary, 0.9);
  rightWing.drawPolygon([18, -4, 74, -58, 55, 8, 18, 24]);
  rightWing.endFill();
  rightWing.name = "right-wing";
  dragon.addChild(rightWing);

  const body = new Graphics();
  body.beginFill(primary, 1);
  body.drawEllipse(0, 4, 42, 26);
  body.endFill();
  dragon.addChild(body);

  const head = new Graphics();
  head.beginFill(primary, 1);
  head.drawCircle(43, -9, 18);
  head.drawPolygon([48, -24, 56, -42, 59, -20]);
  head.drawPolygon([32, -23, 34, -42, 43, -25]);
  head.endFill();
  head.beginFill(secondary, 1);
  head.drawCircle(49, -12, 3);
  head.endFill();
  dragon.addChild(head);

  return dragon;
};

const buildGenericActor = (sceneId: string): Container => {
  if (sceneId.includes("dragon")) return buildProceduralDragon(sceneId);
  const actor = new Container();
  const seed = hashScene(sceneId);
  const color = 0x55b8ff + (seed % 0x202020);

  const halo = new Graphics();
  halo.lineStyle(4, color, 0.9);
  halo.drawCircle(0, 0, 42);
  actor.addChild(halo);

  const core = new Graphics();
  core.beginFill(color, 0.75);
  core.drawPolygon([0, -34, 30, 22, 0, 10, -30, 22]);
  core.endFill();
  actor.addChild(core);
  return actor;
};

const buildAssetActor = async (
  sceneId: string,
): Promise<{ actor: Container; asset: RuleSceneAsset | null }> => {
  const asset = await getRuleSceneAsset(sceneId);
  if (!asset) return { actor: buildGenericActor(sceneId), asset: null };

  try {
    const texture = await Assets.load<Texture>(asset.url);
    const wrapper = new Container();
    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    const width = Math.max(1, texture.width);
    const height = Math.max(1, texture.height);
    const scale = Math.min(130 / width, 100 / height, 1.5);
    sprite.scale.set(scale);
    wrapper.addChild(sprite);
    return { actor: wrapper, asset };
  } catch {
    return { actor: buildGenericActor(sceneId), asset: null };
  }
};

const buildCapturedPieceToken = (): Container => {
  const token = new Container();
  const cord = new Graphics();
  cord.lineStyle(3, 0xf2d7a1, 0.95);
  cord.moveTo(0, 18);
  cord.lineTo(0, 38);
  token.addChild(cord);

  const piece = new Graphics();
  piece.beginFill(0xf6f0df, 1);
  piece.lineStyle(3, 0x1d2430, 0.9);
  piece.drawCircle(0, 48, 12);
  piece.drawRoundedRect(-9, 54, 18, 16, 4);
  piece.endFill();
  token.addChild(piece);
  token.alpha = 0;
  token.scale.set(0.4);
  return token;
};

export async function playAssetScene(
  ctx: FxContext,
  payload: FxPayload,
  sceneId: string,
): Promise<void> {
  if (!RULE_SCENE_ID_PATTERN.test(sceneId)) return;

  const target = payload.cell
    ? ctx.toCellPos(payload.cell)
    : {
        x: ctx.app.renderer.width / 2,
        y: ctx.app.renderer.height / 2,
      };
  const { actor, asset } = await buildAssetActor(sceneId);
  const removeCredit = addCredit(ctx, asset);
  const root = new Container();
  const cargo = buildCapturedPieceToken();
  root.addChild(actor);
  root.addChild(cargo);
  root.position.set(-150, Math.max(70, target.y - 90));
  root.alpha = 0;
  root.zIndex = 1_000;
  ctx.app.stage.sortableChildren = true;
  ctx.app.stage.addChild(root);

  const leftWing = actor.getChildByName("left-wing");
  const rightWing = actor.getChildByName("right-wing");
  if (leftWing && rightWing) {
    gsap.to(leftWing.scale, {
      y: 0.55,
      duration: 0.16,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
    gsap.to(rightWing.scale, {
      y: 0.55,
      duration: 0.16,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut",
    });
  }

  await new Promise<void>((resolve) => {
    const timeline = gsap.timeline({
      onComplete: () => {
        gsap.killTweensOf(root);
        gsap.killTweensOf(leftWing);
        gsap.killTweensOf(rightWing);
        root.destroy({ children: true });
        removeCredit();
        resolve();
      },
    });
    timeline
      .to(root, { alpha: 1, duration: 0.15, ease: "power2.out" })
      .to(root.position, {
        x: target.x,
        y: Math.max(70, target.y - 54),
        duration: 0.78,
        ease: "power2.inOut",
      })
      .to(
        cargo,
        {
          alpha: 1,
          duration: 0.18,
          ease: "power2.out",
        },
        ">-0.03",
      )
      .to(
        cargo.scale,
        {
          x: 1,
          y: 1,
          duration: 0.18,
          ease: "back.out(1.8)",
        },
        "<",
      )
      .to(root.position, {
        x: ctx.app.renderer.width + 180,
        y: Math.max(-80, target.y - 190),
        duration: 1.05,
        ease: "power2.in",
      })
      .to(root, { alpha: 0, duration: 0.18 }, ">-0.18");
  });
}
