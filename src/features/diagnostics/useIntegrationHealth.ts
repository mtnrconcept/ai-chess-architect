import { useQuery } from "@tanstack/react-query";

import { isSupabaseConfigured, supabase } from "@/integrations/supabase/client";
import type { IntegrationHealthResponse } from "@/types/integration";

const fetchIntegrationHealth = async (): Promise<IntegrationHealthResponse> => {
  if (!supabase) {
    throw new Error("Client Supabase non configuré pour les diagnostics");
  }

  const { data, error } = await supabase.functions.invoke<IntegrationHealthResponse>("integration-health", {
    body: {},
  });

  if (error) {
    throw new Error(error.message ?? "Impossible de vérifier l'état des intégrations");
  }

  if (!data) {
    throw new Error("Réponse vide reçue du diagnostic des intégrations");
  }

  return data;
};

export const useIntegrationHealth = () =>
  useQuery({
    queryKey: ["integration-health"],
    queryFn: fetchIntegrationHealth,
    enabled: isSupabaseConfigured,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
