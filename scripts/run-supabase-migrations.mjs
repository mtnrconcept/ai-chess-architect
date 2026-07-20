#!/usr/bin/env node

// Alias historique conservé pour compatibilité. Le suivi parallèle dans
// public.__lovable_schema_migrations a été retiré : le CLI Supabase et son
// historique officiel sont désormais l'unique chemin d'application.
await import('./supabase-db-push.mjs');
