import { describe, expect, it } from "vitest";
import { announcementFromFen, announcementFromGameStatus } from "./GameStatusAnnouncement";

describe("check and checkmate announcements", () => {
  it("recognizes an ordinary check with legal escapes", () => {
    expect(announcementFromFen("4k3/8/8/8/8/8/4R3/4K3 b - - 0 1")).toBe("check");
  });
  it("recognizes an actual checkmate before a simple check", () => {
    expect(announcementFromFen("7k/6Q1/6K1/8/8/8/8/8 b - - 0 1")).toBe("checkmate");
  });
  it("does not announce checks on a normal or invalid position", () => {
    expect(announcementFromFen("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")).toBeNull();
    expect(announcementFromFen("corrupt")).toBeNull();
  });
  it("recognizes local game result statuses", () => {
    expect(announcementFromGameStatus("check")).toBe("check");
    expect(announcementFromGameStatus("checkmate")).toBe("checkmate");
    expect(announcementFromGameStatus("stalemate")).toBeNull();
    expect(announcementFromGameStatus("active")).toBeNull();
  });
});
