// src/lib/tournamentApi.ts
// Accès tournois via supabase-js avec fallback d'ORDER pour éviter les 400 PostgREST.

import { PostgrestError } from "@supabase/supabase-js";
import { getSupabase } from "./supabase/client";

export type Tournament = {
  id: string;
  name: string;
  // aligne ces champs à ton schéma réel :
  starts_at?: string | null;
  created_at?: string | null;
  published?: boolean;
  visibility?: "public" | "private" | string;
  creator_id?: string;
};

type QueryOpts = {
  orderBy?: "starts_at" | "created_at" | null;
  ascending?: boolean;
};

export async function listTournaments(opts?: QueryOpts) {
  const supabase = getSupabase();
  const orderBy = opts?.orderBy ?? "starts_at";
  const ascending = opts?.ascending ?? true;

  // tentative 1: starts_at (par défaut)
  try {
    let query = supabase.from("tournaments").select("*");
    if (orderBy) {
      query = query.order(orderBy, { ascending });
    }
    const { data, error, status } = await query;

    if (error) {
      // Si PostgREST renvoie 400 à cause de "order=col.inexistante"
      if ((error as PostgrestError).code === "PGRST101" || status === 400) {
        throw error;
      }
      // Autre erreur => on la remonte telle quelle
      throw error;
    }
    return data as Tournament[];
  } catch (err) {
    // Fallback : réessayer sans ORDER (ou sur created_at si tu l'as)
    const fallbackOrder: "created_at" | null = "created_at"; // mets à null si pas de colonne
    try {
      let query = getSupabase().from("tournaments").select("*");
      if (fallbackOrder) {
        query = query.order(fallbackOrder, { ascending });
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as Tournament[];
    } catch (err2) {
      // Dernière chance : sans aucun tri
      const { data, error } = await getSupabase().from("tournaments").select("*");
      if (error) throw error;
      return (data ?? []) as Tournament[];
    }
  }
}
