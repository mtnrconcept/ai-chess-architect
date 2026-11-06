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
