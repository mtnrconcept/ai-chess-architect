import { afterEach, describe, expect, it } from "vitest";
import { Application, Container } from "pixi.js";
import gsap from "gsap";
import { resolveFx } from "./registry";
import type { FxContext, FxIntent } from "./types";

const createContext = (): FxContext => {
  const app = { stage: new Container() } as unknown as Application;
  return {
    app,
    layer: { ui: {} as HTMLElement },
    toCellPos: () => ({ x: 160, y: 140 }),
  };
};

afterEach(() => {
  gsap.globalTimeline.clear();
});

describe("rule engine effects adapter", () => {
  it.each([
    "combat.freeze",
    "combat.hit",
    "combat.burn",
    "viz.scan",
    "viz.highlight",
  ] as const)(
    "draws %s instead of silently ignoring a generated effect",
    async (intent) => {
      const ctx = createContext();
      await resolveFx({ intent } as FxIntent, ctx, { cell: "e4" });
      expect(ctx.app.stage.children.length).toBeGreaterThan(0);
      ctx.app.stage.destroy({ children: true });
    },
  );

  it("holds a mine decal until the engine clears its tile", async () => {
    const ctx = createContext();
    await resolveFx({ intent: "object.spawn", kind: "mine" }, ctx, {
      cell: "e4",
    });
    expect(ctx.app.stage.children).toHaveLength(1);
    await resolveFx({ intent: "object.clear" }, ctx, { cell: "e4" });
    expect(ctx.app.stage.children).toHaveLength(0);
    ctx.app.stage.destroy({ children: true });
  });

  it("does not draw on missing or malformed board coordinates", async () => {
    const ctx = createContext();
    await resolveFx({ intent: "combat.explosion" }, ctx, { cell: "../app" });
    await resolveFx({ intent: "combat.freeze" }, ctx, {});
    expect(ctx.app.stage.children).toHaveLength(0);
    ctx.app.stage.destroy({ children: true });
  });
});
