import {describe,it,expect} from "vitest";
import {isTournamentId,tournamentFriendlyRoomName,isTournamentFriendlyRoom} from "./tournament-friendly-rooms";

const id="b7b3a8cc-90af-4a92-9bb2-a38058d74291";
describe("tournament-friendly room labels",()=>{
 it("checks tournament ids before using them in room names",()=>{
  expect(isTournamentId(id)).toBe(true);
  expect(isTournamentId("foo")).toBe(false);
  expect(()=>tournamentFriendlyRoomName("foo")).toThrow();
 });
 it("matches only the named tournament and not all open global rooms",()=>{
  expect(isTournamentFriendlyRoom(tournamentFriendlyRoomName(id),id)).toBe(true);
  expect(isTournamentFriendlyRoom("Aichess Tournoi aaaaaaaa 10min",id)).toBe(false);
 });
});
