#!/usr/bin/env node
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ VITE_SUPABASE_URL et SERVICE_ROLE_KEY requis');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

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
    const functionsUrl = SUPABASE_URL.replace('.supabase.co', '.functions.supabase.co');
    const response = await fetch(`${functionsUrl}/sync-tournaments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({}),
    });

    if (response.ok) {
      const data = await response.json();
      console.log('   ✓ Tournois créés:', data);
    } else {
      console.error('   ❌ Échec sync-tournaments:', await response.text());
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

fixTournaments().catch(console.error);
