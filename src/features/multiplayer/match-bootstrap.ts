export type MatchBootstrapFailure = "not-found" | "forbidden" | "error";

export const classifyMatchBootstrapFailure = (
  error: unknown,
): MatchBootstrapFailure => {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toUpperCase();

  if (
    normalized.includes("MATCH_NOT_ACCESSIBLE") ||
    normalized.includes("ROOM_MEMBERSHIP_REQUIRED") ||
    normalized.includes("AUTH_REQUIRED") ||
    normalized.includes("42501") ||
    normalized.includes("FORBIDDEN")
  ) {
    return "forbidden";
  }
  if (
    normalized.includes("MATCH_NOT_FOUND") ||
    normalized.includes("PGRST116") ||
    normalized.includes("INTROUVABLE")
  ) {
    return "not-found";
  }
  return "error";
};

export const truncateServerIdentity = (value: string, visible = 8): string => {
  if (value.length <= visible * 2 + 1) return value;
  return `${value.slice(0, visible)}…${value.slice(-visible)}`;
};
