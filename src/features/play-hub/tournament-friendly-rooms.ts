const TOURNAMENT_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isTournamentId = (value: string | undefined | null): value is string =>
  typeof value === "string" && TOURNAMENT_UUID.test(value);

/** Cosmetic label only. Server-side chess_rooms/matches remain authoritative. */
export function tournamentFriendlyRoomName(tournamentId: string): string {
  if (!isTournamentId(tournamentId)) throw new Error("Tournament ID invalid");
  return `Aichess Tournoi ${tournamentId.slice(0, 8).toLowerCase()} 10min`;
}
export function isTournamentFriendlyRoom(name: string, tournamentId: string): boolean {
  if (!isTournamentId(tournamentId)) return false;
  return name === tournamentFriendlyRoomName(tournamentId);
}
