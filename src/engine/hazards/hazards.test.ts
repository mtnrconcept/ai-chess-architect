import { describe, expect, it } from "vitest";
import { HazardManager } from "./index";

describe("HazardManager", () => {
  it("spawn tile hazard", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "mine", tile: "e4", ttl: 2 });
    expect(hazard.tiles).toEqual(["e4"]);
    expect(manager.get(hazard.id)).toBeDefined();
  });

  it("spawn area hazard", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "wall", area: ["e4", "e5"] });
    expect(hazard.tiles).toEqual(["e4", "e5"]);
    expect(manager.getHazardsAt("e5")).toHaveLength(1);
  });

  it("tick reduces ttl and expires", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "dynamite", tile: "d4", ttl: 1 });
    const resolutions = manager.tick();
    expect(
      resolutions.find(
        (res) => res.trigger === "expire" && res.hazardId === hazard.id,
      ),
    ).toBeDefined();
    expect(manager.get(hazard.id)).toBeUndefined();
  });

  it("tick trigger executes onTick effects", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({
      type: "glue",
      tile: "d4",
      ttl: 2,
      triggers: { onTick: [{ action: "hazard.slow" }] },
    });
    const resolutions = manager.tick();
    const tickResolution = resolutions.find(
      (res) => res.hazardId === hazard.id && res.trigger === "tick",
    );
    expect(tickResolution?.effects).toHaveLength(1);
  });

  it("handleEnter returns enter triggers", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({
      type: "glue",
      tile: "c3",
      triggers: {
        onEnter: [{ action: "status.apply", params: { status: "slowed" } }],
      },
    });
    const resolutions = manager.handleEnter("c3");
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].hazardId).toBe(hazard.id);
  });

  it("handleStay returns stay triggers", () => {
    const manager = new HazardManager();
    manager.spawn({
      type: "fire",
      tile: "f6",
      triggers: {
        onStay: [{ action: "status.apply", params: { status: "burn" } }],
      },
    });
    const resolutions = manager.handleStay("f6");
    expect(resolutions).toHaveLength(1);
    expect(resolutions[0].effects[0].action).toBe("status.apply");
  });

  it("explode removes hazard and returns effects", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "bomb", tile: "a1" });
    const resolution = manager.explode(hazard.id, 2);
    expect(resolution.trigger).toBe("explode");
    expect(manager.get(hazard.id)).toBeUndefined();
  });

  it("remove deletes hazard", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "trap", tile: "b2" });
    manager.remove(hazard.id);
    expect(manager.get(hazard.id)).toBeUndefined();
  });

  it("serialize and deserialize restores state", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "trap", tile: "h1", ttl: 3 });
    manager.advanceTurn();
    const serialized = manager.serialize();
    const restored = HazardManager.deserialize(serialized);
    expect(restored.get(hazard.id)).toBeDefined();
  });

  it("throws when spawning without tile or area", () => {
    const manager = new HazardManager();
    expect(() => manager.spawn({ type: "bad" })).toThrow();
  });

  it("does not expire hazard without ttl", () => {
    const manager = new HazardManager();
    const hazard = manager.spawn({ type: "permanent", tile: "g5" });
    manager.tick();
    expect(manager.get(hazard.id)).toBeDefined();
  });

  it("unique ids for multiple hazards", () => {
    const manager = new HazardManager();
    const first = manager.spawn({ type: "mine", tile: "a2" });
    const second = manager.spawn({ type: "mine", tile: "a3" });
    expect(first.id).not.toBe(second.id);
  });
});
