#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './utils/env.mjs';
import { assertConfirmedSupabaseTarget } from './utils/supabase-target.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
loadEnv(projectRoot);

const envValue = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

if (envValue(process.env.SYNC_TOURNAMENTS_CONFIRMED) !== 'true') {
  console.log(
    '[sync-tournaments] Synchronisation distante désactivée. Définis SYNC_TOURNAMENTS_CONFIRMED=true pour l’autoriser explicitement.',
  );
  process.exit(0);
}

const supabaseUrl =
  envValue(process.env.SUPABASE_URL) ??
  envValue(process.env.VITE_SUPABASE_URL);
const publicKey =
  envValue(process.env.SUPABASE_PUBLISHABLE_KEY) ??
  envValue(process.env.SUPABASE_ANON_KEY) ??
  envValue(process.env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
  envValue(process.env.VITE_SUPABASE_ANON_KEY);

if (!supabaseUrl || !publicKey) {
  console.error(
    '[sync-tournaments] SUPABASE_URL et une clé anon/publishable sont obligatoires quand la synchronisation est activée.',
  );
  process.exit(1);
}

const lowerKey = publicKey.toLowerCase();
if (
  lowerKey.startsWith('sb_secret_') ||
  lowerKey.startsWith('sb_service_role_')
) {
  console.error(
    '[sync-tournaments] Une clé privilégiée a été refusée. Utilise uniquement une clé anon/publishable.',
  );
  process.exit(1);
}

if (publicKey.split('.').length === 3) {
  try {
    const payload = JSON.parse(
      Buffer.from(publicKey.split('.')[1], 'base64url').toString('utf8'),
    );
    if (payload?.role !== 'anon') {
      console.error(
        '[sync-tournaments] Le JWT fourni n’est pas une clé anon; opération refusée.',
      );
      process.exit(1);
    }
  } catch {
    console.error('[sync-tournaments] JWT Supabase invalide.');
    process.exit(1);
  }
} else if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(publicKey)) {
  console.error('[sync-tournaments] Clé publishable Supabase invalide.');
  process.exit(1);
}

try {
  assertConfirmedSupabaseTarget({
    targetUrl: supabaseUrl,
    label: 'sync-tournaments',
  });
} catch (error) {
  console.error(
    `[sync-tournaments] ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}

let functionsBase = envValue(
  process.env.SUPABASE_FUNCTIONS_URL,
);
try {
  const url = new URL(functionsBase ?? supabaseUrl);
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('protocole invalide');
  }
  if (!functionsBase) {
    url.pathname = `${url.pathname.replace(/\/+$/, '')}/functions/v1`;
  }
  functionsBase = url.toString().replace(/\/+$/, '');
} catch {
  console.error('[sync-tournaments] URL Supabase/Functions invalide.');
  process.exit(1);
}

try {
  assertConfirmedSupabaseTarget({
    targetUrl: functionsBase,
    label: 'sync-tournaments functions endpoint',
  });
} catch (error) {
  console.error(
    `[sync-tournaments] ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}

const endpoint = `${functionsBase}/sync-tournaments`;

try {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: publicKey,
      Authorization: `Bearer ${publicKey}`,
      'x-client-info': 'ai-chess-architect-build',
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    console.error(
      `[sync-tournaments] Échec HTTP ${response.status}; le build est arrêté pour éviter un état partiel.`,
    );
    process.exit(1);
  }

  console.log('[sync-tournaments] Synchronisation terminée.');
} catch (error) {
  console.error(
    `[sync-tournaments] Appel impossible: ${error instanceof Error ? error.message : error}`,
  );
  process.exit(1);
}
