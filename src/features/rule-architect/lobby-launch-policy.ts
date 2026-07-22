export function getRuleLobbyLaunchBlockReason(
  mode: "player" | "ai",
): string | null {
  return mode === "player"
    ? "Ce lobby historique ne peut pas être lancé tant que le runtime serveur autoritaire n’est pas disponible. Aucune donnée du lobby n’a été supprimée."
    : null;
}
