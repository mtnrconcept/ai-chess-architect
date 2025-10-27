#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnv } from './utils/env.mjs';

const __filename = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(__filename), '..');

loadEnv(projectRoot);

const projectRef = process.env.SUPABASE_PROJECT_ID ?? process.env.SUPABASE_PROJECT_REF ?? 'ucaqbhmyutlnitnedowk';
const dbUrl = process.env.SUPABASE_DB_URL;

if (!dbUrl) {
  console.error('\x1b[31m[supabase-db-push]\x1b[0m La variable d\'environnement SUPABASE_DB_URL est absente.');
  console.error('Ajoute-la à ton fichier .env pour cibler la base de données Supabase Lovable.');
  process.exit(1);
}

console.log('\x1b[36m[supabase-db-push]\x1b[0m Synchronisation des migrations vers Supabase…');
console.log(`\x1b[90m→\x1b[0m base de données : ${dbUrl.replace(/:[^:@/]+@/, ':***@')}`);
if (projectRef) {
  console.log(`\x1b[90m→\x1b[0m projet        : ${projectRef}`);
}

const args = ['--yes', '--', '@supabase/cli', 'db', 'push', '--db-url', dbUrl];

if (projectRef) {
  args.push('--project-ref', projectRef);
}

if (process.env.CI) {
  args.push('--non-interactive');
}

const child = spawn('npx', args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    FORCE_COLOR: '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`\x1b[31m[supabase-db-push]\x1b[0m Processus interrompu (${signal}).`);
    process.exit(1);
  }

  if (code !== 0) {
    console.error(`\x1b[31m[supabase-db-push]\x1b[0m Échec avec le code ${code}.`);
    process.exit(code ?? 1);
  }

  console.log('\x1b[32m[supabase-db-push]\x1b[0m Migrations Supabase appliquées avec succès.');
});
