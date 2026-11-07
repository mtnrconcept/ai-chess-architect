import { describe, expect, it } from "vitest";
import { VFXAdapter } from "./vfxAdapter";
import type { FxIntent, FxPayload } from "@/fx/types";

describe("VFXAdapter custom rule effects", () => {
  it("rehydrates persistent mine decals when Pixi mounts after the first rule action", () => {
    const adapter = new VFXAdapter();
    adapter.spawnDecal("mine", "d4");
    const calls: Array<{ intents?: FxIntent[]; payload?: FxPayload }> = [];
    adapter.setFxTrigger(async (intents, payload) => {
      calls.push({ intents, payload });
    });
    expect(calls).toContainEqual({
      intents: [{ intent: "object.spawn", kind: "mine" }],
      payload: { cell: "d4" },
    });

    adapter.clearDecal("d4");
    adapter.setFxTrigger(undefined);
    calls.length = 0;
    adapter.setFxTrigger(async (intents, payload) => {
      calls.push({ intents, payload });
    });
    expect(calls).toEqual([]);
  });

  it("maps a generated quicksand decal to free procedural sand rendering", async () => {
    const adapter = new VFXAdapter();
    const calls: Array<{ intents?: FxIntent[]; payload?: FxPayload }> = [];
    adapter.setFxTrigger(async (intents, payload) => {
      calls.push({ intents, payload });
    });
    adapter.spawnDecal("quicksand_tile", "e3");
    expect(calls).toContainEqual({
      intents: [{ intent: "object.spawn", kind: "quicksand" }],
      payload: { cell: "e3" },
    });
    adapter.playAnimation("quicksand_splash", "e3");
    expect(calls).toContainEqual({
      intents: [{
        intent: "combat.hit",
        power: "large",
        style: { color: "#e8b866", glow: "#ffd98c", sparks: true },
      }],
      payload: { cell: "e3" },
    });
    adapter.clearDecal("e3");
    expect(calls).toContainEqual({
      intents: [{ intent: "object.clear" }],
      payload: { cell: "e3" },
    });
  });

  it("fan-outs authoritative decals to the React marker and Pixi renderer", async () => {
    const adapter = new VFXAdapter();
    const renderEvents: Array<{ intents?: FxIntent[]; payload?: FxPayload }> = [];
    const mirrorEvents: Array<[string, string | null]> = [];
    adapter.setDecalCallbacks({
      spawn: (sprite, tile) => mirrorEvents.push([tile, sprite]),
      clear: (tile) => mirrorEvents.push([tile, null]),
    });
    adapter.setFxTrigger(async (intents, payload) => {
      renderEvents.push({ intents, payload });
    });
    adapter.spawnDecal("quicksand", "e3");
    expect(mirrorEvents).toContainEqual(["e3", "quicksand"]);
    expect(renderEvents).toContainEqual({
      intents: [{ intent: "object.spawn", kind: "quicksand" }],
      payload: { cell: "e3" },
    });
    adapter.clearDecal("e3");
    expect(mirrorEvents).toContainEqual(["e3", null]);
    expect(renderEvents).toContainEqual({
      intents: [{ intent: "object.clear" }],
      payload: { cell: "e3" },
    });
  });

  it("clears a rendered persistent hazard when the engine clears the decal", async () => {
    const adapter = new VFXAdapter();
    const calls: Array<{ intents?: FxIntent[]; payload?: FxPayload }> = [];
    adapter.setFxTrigger(async (intents, payload) => {
      calls.push({ intents, payload });
    });

    adapter.spawnDecal("mine", "e4");
    adapter.clearDecal("e4");
    expect(calls).toContainEqual({
      intents: [{ intent: "object.spawn", kind: "mine" }],
      payload: { cell: "e4" },
    });
    expect(calls).toContainEqual({
      intents: [{ intent: "object.clear" }],
      payload: { cell: "e4" },
    });
  });
});
