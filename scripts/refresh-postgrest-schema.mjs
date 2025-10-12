#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

function resolveProjectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '..');
}

function normaliseEnvLine(line) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) {
    return null;
  }

  const withoutExport = trimmed.startsWith('export ')
    ? trimmed.slice('export '.length).trim()
    : trimmed;

  const equalsIndex = withoutExport.indexOf('=');
  if (equalsIndex === -1) {
    return null;
  }

  const key = withoutExport.slice(0, equalsIndex).trim();
  if (!key) {
    return null;
  }

  let rawValue = withoutExport.slice(equalsIndex + 1).trim();
  if (
    (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
    (rawValue.startsWith("'") && rawValue.endsWith("'"))
  ) {
    rawValue = rawValue.slice(1, -1);
  }

  const value = rawValue.replace(/\\n/g, '\n');
  return { key, value };
}

function applyEnvFromFile(filePath) {
  if (!existsSync(filePath)) {
    return;
  }

  const content = readFileSync(filePath, 'utf8');
  content
    .split(/\r?\n/)
    .map(normaliseEnvLine)
    .filter((entry) => entry !== null)
    .forEach(({ key, value }) => {
      if (process.env[key] === undefined) {
        process.env[key] = value;
      }
    });
}

function loadEnv(projectRoot) {
  const candidateFiles = ['.env.local', '.env'];
  for (const fileName of candidateFiles) {
    applyEnvFromFile(path.join(projectRoot, fileName));
  }
}

function normaliseConnectionString(rawUrl) {
  if (!rawUrl) {
    return null;
  }

  const trimmed = rawUrl.trim();
  if (!trimmed) {
    return null;
  }

  if (/sslmode=/i.test(trimmed)) {
    return trimmed;
  }

  const separator = trimmed.includes('?') ? '&' : '?';
  return `${trimmed}${separator}sslmode=require`;
}

async function main() {
  const projectRoot = resolveProjectRoot();
  loadEnv(projectRoot);

  const rawUrl =
    process.env.SUPABASE_DB_URL ??
    process.env.POSTGRES_URL ??
    process.env.DATABASE_URL ??
    process.env.SUPABASE_DB_CONNECTION ??
    null;

  const connectionString = normaliseConnectionString(rawUrl);

  if (!connectionString) {
    console.error(
      '❌ Impossible de déterminer la chaîne de connexion. Définissez SUPABASE_DB_URL (ou POSTGRES_URL / DATABASE_URL).'
    );
    process.exit(1);
  }

  const sql = postgres(connectionString, {
    transform: {
      undefined: null,
    },
    ssl: 'require',
    max: 1,
  });

  try {
    console.log("Envoi de NOTIFY pgrst, 'reload schema' ...");
    await sql.unsafe("select pg_notify('pgrst','reload schema');");
    console.log('✅ Cache PostgREST rafraîchi.');
  } catch (error) {
    console.error("\n❌ Échec du rafraîchissement du cache PostgREST:");
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main();
