#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { lookup } from 'node:dns/promises';
import postgres from 'postgres';

const MIGRATIONS_TABLE = 'public.__lovable_schema_migrations';
const IPV6_NETWORK_ERROR_CODES = new Set(['ENETUNREACH', 'EHOSTUNREACH']);

const maskConnectionString = (value) => value.replace(/:(?:[^:@/]+)@/, ':***@');

const isLikelyIpv6ConnectivityError = (error) => {
  if (!error) {
    return false;
  }

  if (typeof error.code === 'string' && IPV6_NETWORK_ERROR_CODES.has(error.code)) {
    return true;
  }

  const message = typeof error.message === 'string' ? error.message.toLowerCase() : '';
  return message.includes('ipv6') || message.includes('::');
};

const resolveConnectionStringWithIpv4Hostaddr = async (connectionString) => {
  try {
    const url = new URL(connectionString);

    if (url.searchParams.has('hostaddr')) {
      return null;
    }

    const hostname = url.hostname;
    if (!hostname) {
      return null;
    }

    const { address } = await lookup(hostname, { family: 4 });
    if (!address) {
      return null;
    }

    url.searchParams.set('hostaddr', address);
    return { connectionString: url.toString(), hostaddr: address };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `Impossible de résoudre une adresse IPv4 pour ${maskConnectionString(connectionString)}. Détail: ${message}`
    );
    return null;
  }
};

const closeSqlClient = async (sql) => {
  if (!sql) {
    return;
  }

  try {
    await sql.end({ timeout: 5 });
  } catch (error) {
    if (error instanceof Error) {
      console.warn(`Fermeture de connexion Postgres échouée: ${error.message}`);
    }
  }
};

const createSqlClient = async (connectionString) => {
  const baseOptions = {
    transform: {
      undefined: null,
    },
    ssl: 'require',
    max: 1,
  };

  let sql = postgres(connectionString, baseOptions);

  const verifyConnection = async (client) => {
    await client.unsafe('select 1');
  };

  try {
    await verifyConnection(sql);
    return { sql, connectionStringUsed: connectionString };
  } catch (error) {
    await closeSqlClient(sql);

    if (isLikelyIpv6ConnectivityError(error)) {
      const fallback = await resolveConnectionStringWithIpv4Hostaddr(connectionString);
      if (fallback) {
        console.warn(
          `Connexion IPv6 vers Supabase indisponible (${error instanceof Error ? error.message : error}). ` +
            `Nouvel essai via IPv4 (hostaddr=${fallback.hostaddr}).`
        );

        sql = postgres(fallback.connectionString, baseOptions);
        try {
          await verifyConnection(sql);
          return { sql, connectionStringUsed: fallback.connectionString };
        } catch (fallbackError) {
          await closeSqlClient(sql);
          throw fallbackError;
        }
      }
    }

    throw error;
  }
};

function resolveProjectRoot() {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '..');
}

function resolveMigrationDir(projectRoot) {
  return path.join(projectRoot, 'supabase', 'migrations');
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
  const candidateFiles = [
    '.env.local',
    '.env',
  ];

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
  const { sql, connectionStringUsed } = await createSqlClient(connectionString);

  if (connectionStringUsed !== connectionString) {
    console.log(
      `Connexion rétablie via ${maskConnectionString(connectionStringUsed)} (fallback IPv4).`
    );
  }

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
    await closeSqlClient(sql);
  }
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

  const migrationsDir = resolveMigrationDir(projectRoot);
  console.log(`Utilisation des migrations depuis ${migrationsDir}`);
  console.log(`Connexion à ${maskConnectionString(connectionString)}`);

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
