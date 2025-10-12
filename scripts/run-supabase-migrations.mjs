#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

function resolveMigrationDir() {
  const currentFile = fileURLToPath(import.meta.url);
  const projectRoot = path.resolve(path.dirname(currentFile), '..');
  return path.join(projectRoot, 'supabase', 'migrations');
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

async function loadMigrations(dir) {
  const files = await readdir(dir);
  return files
    .filter((file) => file.toLowerCase().endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

async function applyMigrations(connectionString, migrationsDir) {
  const sql = postgres(connectionString, {
    transform: {
      undefined: null,
    },
    ssl: 'require',
    max: 1,
  });

  try {
    const migrationFiles = await loadMigrations(migrationsDir);

    if (migrationFiles.length === 0) {
      console.log('Aucune migration SQL à appliquer.');
      return;
    }

    for (const fileName of migrationFiles) {
      const filePath = path.join(migrationsDir, fileName);
      console.log(`\n➡️  Application de la migration: ${fileName}`);

      const sqlSource = await readFile(filePath, 'utf8');
      const statements = sqlSource.trim();

      if (!statements) {
        console.log('   (fichier vide — ignoré)');
        continue;
      }

      await sql.unsafe(statements);
      console.log('   ✅ Migration appliquée avec succès');
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

async function main() {
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

  const migrationsDir = resolveMigrationDir();
  console.log(`Utilisation des migrations depuis ${migrationsDir}`);
  console.log(`Connexion à ${connectionString.replace(/:(?:[^:@\/]+)@/, ':***@')}`);

  try {
    await applyMigrations(connectionString, migrationsDir);
    console.log('\n🎉 Toutes les migrations ont été appliquées.');
  } catch (error) {
    console.error('\n❌ Échec de l\'application des migrations:');
    if (error instanceof Error) {
      console.error(error.message);
    } else {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
