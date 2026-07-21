from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file = Path(path)
    text = file.read_text()
    if new in text:
        return
    if old not in text:
        raise SystemExit(f"Missing expected fragment in {path}: {old[:80]!r}")
    file.write_text(text.replace(old, new, 1))


replace_once(
    "supabase/functions/compile-chess-rule/index.ts",
    'import { buildRuleArchitectSystemPrompt } from "../_shared/rule-architect-prompt.ts";\n',
    'import { buildRuleArchitectSystemPrompt } from "../_shared/rule-architect-prompt.ts";\nimport { normalizeRuleBlueprintCandidate } from "../_shared/rule-blueprint-normalizer.ts";\n',
)
replace_once(
    "supabase/functions/compile-chess-rule/index.ts",
    "    const result = compileRuleBlueprint(openAI.value);\n",
    "    const normalized = normalizeRuleBlueprintCandidate(openAI.value, prompt);\n    const result = compileRuleBlueprint(normalized.value);\n",
)
replace_once(
    "supabase/functions/compile-chess-rule/index.ts",
    "      openAIResponseId: openAI.responseId,\n",
    "      openAIResponseId: openAI.responseId,\n      normalizedFields: normalized.normalizedFields,\n",
)
replace_once(
    "supabase/functions/compile-chess-rule/index.ts",
    "        blueprint: result.blueprint ?? openAI.value,\n",
    "        blueprint: result.blueprint ?? normalized.value,\n",
)

ci = Path(".github/workflows/rule-architect-v2-ci.yml")
ci_text = ci.read_text()
if "supabase/functions/generate-rule-questions/index.ts" not in ci_text:
    ci_text = ci_text.replace(
        "            supabase/functions/compile-chess-rule/index.ts \\\n",
        "            supabase/functions/compile-chess-rule/index.ts \\\n            supabase/functions/generate-rule-questions/index.ts \\\n",
        1,
    )
if "rule-blueprint-normalizer.test.ts" not in ci_text:
    ci_text = ci_text.replace(
        "            supabase/functions/_shared/rule-assets.test.ts \\\n",
        "            supabase/functions/_shared/rule-assets.test.ts \\\n            supabase/functions/_shared/rule-blueprint-normalizer.test.ts \\\n",
        1,
    )
ci.write_text(ci_text)

lobby = Path("src/pages/Lobby.tsx")
lobby_text = lobby.read_text()
if "rule_set_hash: string | null;" not in lobby_text:
    lobby_text = lobby_text.replace(
        "  updated_at: string | null;\n}",
        "  updated_at: string | null;\n  rule_set_hash: string | null;\n}",
        1,
    )
lobby_text = lobby_text.replace(
    "id, name, creator_id, active_rules, max_players, is_active, mode, status, opponent_id, opponent_name, created_at, updated_at",
    "id, name, creator_id, active_rules, max_players, is_active, mode, status, opponent_id, opponent_name, created_at, updated_at, rule_set_hash",
)
helper = '''
const describeSupabaseError = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
};
'''
if "const describeSupabaseError" not in lobby_text:
    lobby_text = lobby_text.replace(
        "type CombinedRuleEntry = {\n",
        helper + "\ntype CombinedRuleEntry = {\n",
        1,
    )
old_cancel = '''  const handleCancelLobby = async () => {
    if (!user || !activeLobby) return;

    try {
      const { error } = await supabase
        .from("lobbies")
        .update({ status: "cancelled", is_active: false })
        .eq("id", activeLobby.id)
        .eq("creator_id", user.id);

      if (error) throw error;

      setActiveLobby(null);
      toast({ title: "Partie annulée" });
      fetchWaitingLobbies();
    } catch (error: unknown) {
      const description =
        error instanceof Error
          ? error.message
          : "Impossible d'annuler la partie";
      toast({
        title: "Erreur",
        description,
        variant: "destructive",
      });
    }
  };'''
new_cancel = '''  const handleCancelLobby = async () => {
    if (!user || !activeLobby) return;

    try {
      if (activeLobby.rule_set_hash) {
        const { data, error } = await supabase.rpc("cancel_rule_lobby_v2", {
          p_lobby_id: activeLobby.id,
        });
        if (error) throw error;
        if (data !== true) throw new Error("Ce lobby ne peut plus être annulé.");
      } else {
        const { error } = await supabase
          .from("lobbies")
          .update({ status: "cancelled", is_active: false })
          .eq("id", activeLobby.id)
          .eq("creator_id", user.id);
        if (error) throw error;
      }

      setActiveLobby(null);
      setWaitingDialogOpen(false);
      setIsQuickPlayOnline(false);
      toast({
        title: "Partie annulée",
        description: "Les règles peuvent à nouveau être modifiées.",
      });
      await Promise.all([fetchWaitingLobbies(), fetchActiveLobby(), fetchRules()]);
    } catch (error: unknown) {
      toast({
        title: "Impossible d'annuler la partie",
        description: describeSupabaseError(
          error,
          "Actualisez la page puis réessayez.",
        ),
        variant: "destructive",
      });
    }
  };'''
if new_cancel not in lobby_text:
    if old_cancel not in lobby_text:
        raise SystemExit("Missing Lobby handleCancelLobby block")
    lobby_text = lobby_text.replace(old_cancel, new_cancel, 1)
lobby_text = lobby_text.replace(
    '''      const description =
        error instanceof Error
          ? error.message
          : "Impossible de mettre à jour la règle";''',
    '''      const description = describeSupabaseError(
        error,
        "Impossible de mettre à jour la règle",
      );''',
    1,
)
lobby.write_text(lobby_text)

guided = Path("src/features/rule-architect/GuidedRuleArchitectPanel.tsx")
guided_text = guided.read_text()
guided_text = guided_text.replace(
    '[Puzzle, "Puzzle du jour", "/daily-puzzle"]',
    '[Puzzle, "Puzzle du jour", "/play-hub"]',
)
guided_text = guided_text.replace(
    '[GraduationCap, "Coach", "/coach"]',
    '[GraduationCap, "Coach", "/analysis"]',
)
guided.write_text(guided_text)

tournaments = Path("src/pages/Tournaments.tsx")
tournaments_text = tournaments.read_text()
recovery = '''
  useEffect(() => {
    if (tournamentsQuery.isSuccess) {
      setTournamentsUnavailable(false);
    }
  }, [tournamentsQuery.isSuccess]);
'''
marker = '''  useEffect(() => {
    if (
      tournamentsError instanceof TournamentFeatureUnavailableError ||'''
if recovery.strip() not in tournaments_text:
    tournaments_text = tournaments_text.replace(marker, recovery + "\n" + marker, 1)
tournaments.write_text(tournaments_text)
