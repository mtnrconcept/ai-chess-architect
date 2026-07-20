const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/i;

export const isStandardRoomId = (value: string): boolean =>
  UUID_PATTERN.test(value);

export const isStandardRoomInvitationToken = (value: string): boolean =>
  INVITATION_TOKEN_PATTERN.test(value);

export function buildStandardRoomInviteUrl(
  origin: string,
  roomId: string,
  invitationToken: string,
): string {
  if (
    !isStandardRoomId(roomId) ||
    !isStandardRoomInvitationToken(invitationToken)
  ) {
    throw new Error("Invitation privée invalide.");
  }
  const url = new URL("/play-hub", origin);
  url.searchParams.set("roomId", roomId.toLowerCase());
  url.searchParams.set("token", invitationToken.toLowerCase());
  return url.toString();
}
