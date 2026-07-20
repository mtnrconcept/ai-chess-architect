const LOBBY_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function parseRuleLobbyInvite(value: string): string | null {
  const trimmed = value.trim();
  if (LOBBY_ID_PATTERN.test(trimmed)) return trimmed.toLowerCase();

  try {
    const url = new URL(trimmed);
    const lobbyId = url.searchParams.get("lobbyId")?.trim() ?? "";
    return LOBBY_ID_PATTERN.test(lobbyId) ? lobbyId.toLowerCase() : null;
  } catch {
    return null;
  }
}
