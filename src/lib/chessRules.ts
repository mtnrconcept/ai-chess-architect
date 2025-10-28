import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL!;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export type ChessRule = {
  rule_id: string;
  variant_id?: string | null;
  name?: string | null;
  version?: number | null;
  payload: Record<string, unknown>;
};

export async function upsertRule(input: ChessRule) {
  const record = {
    rule_id: input.rule_id,
    variant_id: input.variant_id ?? null,
    name: input.name ?? null,
    version: input.version ?? 1,
    payload: input.payload ?? {},
  };

  const { data, error } = await supabase
    .from("chess_rules")
    .upsert(record, {
      onConflict: "rule_id,variant_id",
      ignoreDuplicates: false,
    })
    .select("*")
    .single();

  if (error) {
    console.error("[upsertRule] error", error);
    throw error;
  }
  return data;
}
