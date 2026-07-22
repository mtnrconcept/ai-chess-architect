import { describe, expect, it, vi } from "vitest";
import { MatchAdapter } from "./matchAdapter";

describe("MatchAdapter", () => {
  it("synchronise chaque coup normal une seule fois", () => {
    const adapter = new MatchAdapter("white");

    adapter.syncCommittedMoves(1);
    expect(adapter.get().ply).toBe(2);

    adapter.syncCommittedMoves(1);
    expect(adapter.get().ply).toBe(2);

    adapter.syncCommittedMoves(2);
    expect(adapter.get().ply).toBe(3);
  });

  it("préserve les tours consommés par une action entre deux coups", () => {
    const adapter = new MatchAdapter("white");
    const onTurnEnd = vi.fn();
    adapter.setTurnEndCallback(onTurnEnd);

    adapter.syncCommittedMoves(1);
    adapter.endTurn();
    adapter.syncCommittedMoves(2);

    expect(adapter.get().ply).toBe(4);
    expect(onTurnEnd).toHaveBeenCalledTimes(1);
  });

  it("restaure son compteur de coups et se réinitialise avec une partie vide", () => {
    const adapter = new MatchAdapter("white");
    adapter.syncCommittedMoves(2);
    adapter.endTurn();

    const restored = new MatchAdapter("black");
    restored.deserialize(adapter.serialize());
    restored.syncCommittedMoves(3);
    expect(restored.get()).toEqual({ ply: 5, turnSide: "white" });

    restored.syncCommittedMoves(0);
    expect(restored.get().ply).toBe(1);
  });
});
