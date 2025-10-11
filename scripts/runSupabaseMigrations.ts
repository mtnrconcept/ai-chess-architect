import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { Client } from "pg";

const MIGRATIONS_DIR = path.resolve("supabase", "migrations");

const resolveConnectionString = () => {
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

const main = async () => {
  const connectionString = resolveConnectionString();

  if (!connectionString) {
    console.error(
      "Missing Supabase connection string. Set SUPABASE_DB_URL (or SUPABASE_DB_CONNECTION_STRING) to the Postgres URL.",
    );
    process.exitCode = 1;
    return;
  }

  const migrations = (await readdir(MIGRATIONS_DIR))
    .filter((file) => file.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));

  if (migrations.length === 0) {
    console.log("No migrations found in supabase/migrations.");
    return;
  }

  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await ensureMigrationsTable(client);
    const applied = await fetchAppliedMigrations(client);
    let appliedCount = 0;

    for (const migration of migrations) {
      if (applied.has(migration)) {
        console.log(`Skipping ${migration} (already applied).`);
        continue;
      }

      const sql = await readFile(path.join(MIGRATIONS_DIR, migration), "utf8");
      console.log(`Applying migration ${migration}...`);
      await applyMigration(client, migration, sql);
      appliedCount += 1;
      console.log(`✔ Applied ${migration}`);
    }

    if (appliedCount === 0) {
      console.log("All Supabase migrations were already applied.");
    } else {
      console.log(`Supabase migrations completed successfully (${appliedCount} new file${appliedCount > 1 ? "s" : ""}).`);
    }

    await client.query("select pg_notify('pgrst','reload schema');");
    console.log("Requested PostgREST schema reload via pg_notify('pgrst','reload schema').");
  } finally {
    await client.end();
  }
};

main().catch((error) => {
  console.error("Failed to apply Supabase migrations:", error instanceof Error ? error.message : error);
  process.exit(1);
});
