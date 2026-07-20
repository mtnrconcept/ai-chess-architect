#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './utils/env.mjs';
import { assertConfirmedSupabaseTarget } from './utils/supabase-target.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
loadEnv(projectRoot);

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY requis');
  process.exit(1);
}

try {
  assertConfirmedSupabaseTarget({
    targetUrl: SUPABASE_URL,
    label: 'fix-tournaments',
  });
} catch (error) {
  console.error(
    `❌ ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function fixTournaments() {
  console.log('🔧 Réparation du système de tournois...\n');

  // 1. Vérifier les tables
  console.log('1️⃣ Vérification des tables...');
  const tables = ['tournaments', 'tournament_registrations', 'tournament_matches'];

  for (const table of tables) {
    const { error } = await supabase.from(table).select('count').limit(1);
    if (error) {
      console.error(`   ❌ Table ${table} manquante ou inaccessible`);
      console.log("   → Appliquez les migrations : pnpm run db:push");
      process.exit(1);
    }
    console.log(`   ✓ Table ${table} OK`);
  }

  // 2. Compter les tournois actifs
  console.log('\n2️⃣ Vérification des tournois...');
  const { data: tournaments, count } = await supabase
    .from('tournaments')
    .select('*', { count: 'exact' })
    .eq('status', 'active');

  console.log(`   Tournois actifs : ${count || 0}`);

  if ((count || 0) === 0) {
    console.log('   ⚠️  Aucun tournoi actif - déclenchement de sync-tournaments...');

    // Appeler la fonction
    const response = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/sync-tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      console.log('   ✓ Synchronisation acceptée par la fonction Edge');
    } else {
      console.error(`   ❌ Échec sync-tournaments (HTTP ${response.status})`);
      process.exit(1);
    }
  }

  // 3. Vérifier les règles disponibles
  console.log('\n3️⃣ Vérification des règles...');
  const { data: rules, count: rulesCount } = await supabase
    .from('chess_rules')
    .select('*', { count: 'exact' })
    .eq('status', 'active')
    .eq('is_functional', true);

  console.log(`   Règles actives : ${rulesCount || 0}`);

  if ((rulesCount || 0) < 5) {
    console.log('   ⚠️  Peu de règles disponibles - les tournois utiliseront les fallbacks');
  }

  console.log('\n✅ Réparation terminée !');
  console.log('\n📋 Prochaines étapes :');
  console.log("   1. Vérifiez que les Edge Functions sont déployées");
  console.log("   2. Testez l'inscription à un tournoi depuis l'UI");
  console.log("   3. Vérifiez les logs Supabase en cas d'erreur");
}

fixTournaments().catch(() => {
  console.error('❌ Réparation interrompue par une erreur inattendue.');
  process.exitCode = 1;
});
