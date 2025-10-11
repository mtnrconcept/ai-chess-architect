import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { Client } from "pg";

const DEFAULT_MIGRATIONS_DIR = path.resolve("supabase", "migrations");

type Logger = Pick<typeof console, "info" | "warn" | "error">;

const defaultLogger: Logger = {
  info: console.info.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
};

const resolveConnectionString = (explicit?: string) => {
  if (explicit && explicit.trim().length > 0) {
    return explicit.trim();
  }

  const candidates = [
    process.env.SUPABASE_DB_URL,
    process.env.SUPABASE_DB_CONNECTION_STRING,
    process.env.DATABASE_URL,
  ];

  return candidates.find((value) => typeof value === "string" && value.trim().length > 0)?.trim();
};

const ensureMigrationsTable = async (client: Client) => {
  await client.query("create schema if not exists supabase_migrations;");
  await client.query(`
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      executed_at timestamptz not null default timezone('utc', now()),
      statements_executed integer not null default 0
    );
  `);
};

const fetchAppliedMigrations = async (client: Client) => {
  const { rows } = await client.query<{ version: string }>(
    "select version from supabase_migrations.schema_migrations;",
  );
  return new Set(rows.map((row) => row.version));
};

const countStatements = (sql: string) => {
  const withoutLineComments = sql.replace(/--[^\n]*\n/g, "\n");
  const withoutBlockComments = withoutLineComments.replace(/\/\*[\s\S]*?\*\//g, "");
  const withoutDollarQuoted = withoutBlockComments.replace(/\$[^$]*\$[\s\S]*?\$[^$]*\$/g, "");

  return withoutDollarQuoted
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0).length;
};

const applyMigration = async (client: Client, fileName: string, sql: string) => {
  await client.query("begin;");
  try {
    await client.query(sql);
    await client.query(
      `
        insert into supabase_migrations.schema_migrations (version, statements_executed)
        values ($1, $2)
        on conflict (version) do nothing;
      `,
      [fileName, countStatements(sql)],
    );
    await client.query("commit;");
  } catch (error) {
    await client.query("rollback;");
    throw error;
  }
};

export interface ApplySupabaseMigrationsOptions {
  connectionString?: string;
  migrationsDir?: string;
  logger?: Logger;
  skipSchemaReloadNotification?: boolean;
}

export interface ApplySupabaseMigrationsResult {
  applied: number;
  skipped: number;
  total: number;
}

export class MissingSupabaseConnectionStringError extends Error {
  constructor() {
    super(
      "Missing Supabase connection string. Set SUPABASE_DB_URL (or SUPABASE_DB_CONNECTION_STRING/DATABASE_URL) to the Postgres URL.",
    );
    this.name = "MissingSupabaseConnectionStringError";
  }
}

export const applySupabaseMigrations = async (
  options: ApplySupabaseMigrationsOptions = {},
): Promise<ApplySupabaseMigrationsResult> => {
  const {
    connectionString: explicitConnection,
    migrationsDir = DEFAULT_MIGRATIONS_DIR,
    logger = defaultLogger,
    skipSchemaReloadNotification = false,
  } = options;

  const connectionString = resolveConnectionString(explicitConnection);

  if (!connectionString) {
    throw new MissingSupabaseConnectionStringError();
  }

  const migrations = (await readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (migrations.length === 0) {
    logger.info("No migrations found in supabase/migrations.");
    return { applied: 0, skipped: 0, total: 0 };
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await fetchAppliedMigrations(client);
    let appliedCount = 0;
    let skippedCount = 0;

    for (const migration of migrations) {
      if (applied.has(migration)) {
        logger.info(`Skipping ${migration} (already applied).`);
        skippedCount += 1;
        continue;
      }

      const sql = await readFile(path.join(migrationsDir, migration), "utf8");
      logger.info(`Applying migration ${migration}...`);
      await applyMigration(client, migration, sql);
      appliedCount += 1;
      logger.info(`✔ Applied ${migration}`);
    }

    if (appliedCount === 0) {
      logger.info("All Supabase migrations were already applied.");
    } else {
      logger.info(
        `Supabase migrations completed successfully (${appliedCount} new file${appliedCount > 1 ? "s" : ""}).`,
      );
    }

    if (!skipSchemaReloadNotification) {
      await client.query("select pg_notify('pgrst','reload schema');");
      logger.info("Requested PostgREST schema reload via pg_notify('pgrst','reload schema').");
    }

    return { applied: appliedCount, skipped: skippedCount, total: migrations.length };
  } finally {
    await client.end();
  }
};

export const canResolveSupabaseConnectionString = () => Boolean(resolveConnectionString());

