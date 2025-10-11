import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const rawSupabaseUrl = (Deno.env.get("SUPABASE_URL") ?? "").trim();
const rawServiceRoleKey = (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "").trim();
const rawLovableGatewayUrl = (Deno.env.get("LOVABLE_AI_GATEWAY_URL") ?? "https://ai.gateway.lovable.dev").trim();

if (!rawSupabaseUrl || !rawServiceRoleKey) {
  console.error("[Edge] Variables d'environnement Supabase manquantes : SUPABASE_URL et/ou SUPABASE_SERVICE_ROLE_KEY.");
}

const normalizedGatewayUrl = rawLovableGatewayUrl.replace(/\/$/, "");

export const serviceRoleClient = rawSupabaseUrl && rawServiceRoleKey
  ? createClient(rawSupabaseUrl, rawServiceRoleKey)
  : null;

export const LOVABLE_AI_CHAT_COMPLETIONS_URL = `${normalizedGatewayUrl}/v1/chat/completions`;

export const getLovableApiKey = () => (Deno.env.get("LOVABLE_API_KEY") ?? "").trim();

export const getSupabaseServiceRoleClient = () => serviceRoleClient;
