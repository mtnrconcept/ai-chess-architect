#!/usr/bin/env node
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HELP_MESSAGE = `Usage: npx supabase push\n\nDéploie les migrations Supabase sur la base distante définie par SUPABASE_DB_URL.`;

const [, , command, ...args] = process.argv;

if (!command || command === '--help' || command === '-h' || command === 'help') {
  console.log(HELP_MESSAGE);
  process.exit(command ? 0 : 1);
}

if (command !== 'push') {
  console.error(`Commande inconnue: ${command}`);
  console.error('Seule la sous-commande "push" est supportée.');
  console.error();
  console.error(HELP_MESSAGE);
  process.exit(1);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const scriptPath = path.resolve(__dirname, '..', 'supabase-db-push.mjs');

const child = spawn(process.execPath, [scriptPath, ...args], {
  stdio: 'inherit',
  env: {
    ...process.env,
    FORCE_COLOR: process.env.FORCE_COLOR ?? '1',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.exit(1);
    return;
  }

  process.exit(code ?? 0);
});
