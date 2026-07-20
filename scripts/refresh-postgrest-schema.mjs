#!/usr/bin/env node
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { loadEnv } from './utils/env.mjs';
import { assertConfirmedSupabaseTarget } from './utils/supabase-target.mjs';

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
loadEnv(projectRoot);

const rawUrl =
  process.env.SUPABASE_DB_URL ??
  process.env.POSTGRES_URL ??
  process.env.DATABASE_URL ??
  process.env.SUPABASE_DB_CONNECTION;

if (!rawUrl?.trim()) {
  console.error('[postgrest-reload] Une URL de base Supabase explicite est requise.');
  process.exit(1);
}

let projectRef;
try {
  projectRef = assertConfirmedSupabaseTarget({
    targetUrl: rawUrl,
    label: 'postgrest-reload',
  });
} catch (error) {
  console.error(
    `[postgrest-reload] ${error instanceof Error ? error.message : 'Cible refusée.'}`,
  );
  process.exit(1);
}

const separator = rawUrl.includes('?') ? '&' : '?';
const connectionString = /(?:^|[?&])sslmode=/i.test(rawUrl)
  ? rawUrl
  : `${rawUrl}${separator}sslmode=require`;
const sql = postgres(connectionString, {
  ssl: 'require',
  max: 1,
  transform: { undefined: null },
});

try {
  console.log(`[postgrest-reload] Projet confirmé : ${projectRef}.`);
  await sql.unsafe("select pg_notify('pgrst', 'reload schema')");
  console.log('[postgrest-reload] Cache PostgREST rafraîchi.');
} catch (error) {
  const code = error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : 'UNKNOWN';
  console.error(`[postgrest-reload] Échec de la requête (${code}).`);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
