import type { ChessRule } from "@/types/chess";
import { supabase } from "@/integrations/supabase/client";
import { allPresetRules } from "@/lib/presetRules";
import { convertRuleJsonToChessRule as convertRuleJsonToChessRuleCore } from "@/lib/ruleJsonToChessRule";

/**
 * Convert a RuleJSON from preset_rules table to ChessRule format
 */
export function convertRuleJsonToChessRule(ruleJson: unknown): ChessRule {
  return convertRuleJsonToChessRuleCore(ruleJson, {
    attachOriginal: true,
  });
}

/**
 * Load functional preset rules from database
 */
export async function loadPresetRulesFromDatabase(): Promise<ChessRule[]> {
  try {
    const { data, error } = await supabase
      .from("chess_rules")
      .select("rule_id, rule_name, rule_json")
      .eq("source", "preset")
      .eq("is_functional", true)
      .eq("status", "active");

    if (error) {
      console.error("[presetRulesAdapter] Error loading preset rules:", error);
      return [];
    }

    if (!data || data.length === 0) {
      console.warn(
        "[presetRulesAdapter] No preset rules returned by database, using local fallback.",
      );
      return allPresetRules;
    }

    const converted = data
      .filter((row) => row.rule_json)
      .map((row) =>
        convertRuleJsonToChessRuleCore(row.rule_json, {
          row,
          attachOriginal: true,
        }),
      );

    if (converted.length === 0) {
      console.warn(
        "[presetRulesAdapter] Empty preset payload, using bundled presets.",
      );
      return allPresetRules;
    }

    return converted;
  } catch (error) {
    console.error("[presetRulesAdapter] Failed to load preset rules:", error);
    return [];
  }
}

/**
 * Load a specific preset rule by ID
 */
export async function loadPresetRuleById(
  ruleId: string,
): Promise<ChessRule | null> {
  try {
    const { data, error } = await supabase
      .from("chess_rules")
      .select("rule_json")
      .eq("rule_id", ruleId)
      .eq("source", "preset")
      .eq("is_functional", true)
      .eq("status", "active")
      .maybeSingle();

    if (error || !data?.rule_json) {
      return null;
    }

    return convertRuleJsonToChessRuleCore(data.rule_json, {
      attachOriginal: true,
    });
  } catch (error) {
    console.error("[presetRulesAdapter] Failed to load rule:", error);
    return null;
  }
}
