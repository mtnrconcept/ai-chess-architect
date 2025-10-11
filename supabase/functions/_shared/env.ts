import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const rawSupabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const rawServiceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();

if (!rawSupabaseUrl || !rawServiceRoleKey) {
  console.error("[Edge] Variables d'environnement Supabase manquantes : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY.");
}

export const serviceRoleClient = rawSupabaseUrl && rawServiceRoleKey
  ? createClient(rawSupabaseUrl, rawServiceRoleKey)
  : null;

export const getSupabaseServiceRoleClient = () => serviceRoleClient;
