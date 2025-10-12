#!/usr/bin/env node
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

const MIGRATIONS_TABLE = 'public.__lovable_schema_migrations';

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

async function ensureMigrationsTable(sql) {
  await sql.unsafe(`
    create table if not exists ${MIGRATIONS_TABLE} (
      filename text primary key,
      executed_at timestamptz not null default timezone('utc', now())
    )
  `);
}

async function fetchExecutedMigrations(sql) {
  const rows = await sql.unsafe(`select filename from ${MIGRATIONS_TABLE}`);
  return new Set(rows.map((row) => row.filename));
}

async function markMigrationAsRun(sql, fileName) {
  await sql.unsafe(
    `insert into ${MIGRATIONS_TABLE} (filename) values ($1) on conflict (filename) do nothing`,
    [fileName]
  );
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

    await ensureMigrationsTable(sql);
    const executedMigrations = await fetchExecutedMigrations(sql);
    const pendingMigrations = migrationFiles.filter(
      (fileName) => !executedMigrations.has(fileName)
    );

    if (pendingMigrations.length === 0) {
      console.log('Aucune nouvelle migration à appliquer (la base est à jour).');
      return;
    }

    for (const fileName of pendingMigrations) {
      const filePath = path.join(migrationsDir, fileName);
      console.log(`\n➡️  Application de la migration: ${fileName}`);

      const sqlSource = await readFile(filePath, 'utf8');
      const statements = sqlSource.trim();

      if (!statements) {
        console.log('   (fichier vide — ignoré)');
        continue;
      }

      await sql.begin(async (tx) => {
        await tx.unsafe(statements);
        await markMigrationAsRun(tx, fileName);
      });
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
