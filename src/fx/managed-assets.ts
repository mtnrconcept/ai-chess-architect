import {
  requireSupabaseClient,
  supabaseDiagnostics,
} from "@/integrations/supabase/client";
import {
  parseManagedCinematicResourceId,
  RULE_ASSET_BUCKET,
} from "./managed-asset-ids";

export function resolveManagedAssetPublicUrl(resourceId: string): string {
  const parsed = parseManagedCinematicResourceId(resourceId);
  if (!parsed) {
    throw new Error("Identifiant de cinématique gérée invalide.");
  }

  const client = requireSupabaseClient();
  const { data } = client.storage
    .from(RULE_ASSET_BUCKET)
    .getPublicUrl(parsed.storagePath);
  const publicUrl = new URL(data.publicUrl);
  const resolvedSupabaseUrl = supabaseDiagnostics.resolvedUrl;
  if (!resolvedSupabaseUrl) {
    throw new Error("Supabase n'est pas configuré pour les assets gérés.");
  }
  const supabaseUrl = new URL(resolvedSupabaseUrl);
  const expectedPath = `/storage/v1/object/public/${RULE_ASSET_BUCKET}/${parsed.storagePath}`;

  if (
    publicUrl.protocol !== "https:" ||
    publicUrl.origin !== supabaseUrl.origin ||
    publicUrl.pathname !== expectedPath ||
    publicUrl.username !== "" ||
    publicUrl.password !== "" ||
    publicUrl.search !== "" ||
    publicUrl.hash !== ""
  ) {
    throw new Error("URL de cinématique gérée refusée.");
  }

  return publicUrl.toString();
}
