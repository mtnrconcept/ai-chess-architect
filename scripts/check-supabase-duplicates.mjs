#!/usr/bin/env node
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';

const rootDir = process.cwd();
const migrationsDir = path.join(rootDir, 'supabase', 'migrations');
const functionsDir = path.join(rootDir, 'supabase', 'functions');

async function readDirectoryEntries(dir, filter) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (error && error.code === 'ENOENT') {
      return [];
    }
    throw error;
  }

  return entries
    .filter(entry => (filter ? filter(entry) : true))
    .map(entry => path.join(dir, entry.name));
}

async function collectDuplicateTables() {
  const tablePattern = /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z0-9_]+)/gi;
  const files = await readDirectoryEntries(
    migrationsDir,
    entry => entry.isFile() && entry.name.endsWith('.sql'),
  );

  const tableOccurrences = new Map();

  for (const filePath of files) {
    const sql = await fs.readFile(filePath, 'utf8');
    const fileName = path.basename(filePath);

    for (const match of sql.matchAll(tablePattern)) {
      const tableName = match[1];
      if (!tableOccurrences.has(tableName)) {
        tableOccurrences.set(tableName, []);
      }
      tableOccurrences.get(tableName).push(fileName);
    }
  }

  return Array.from(tableOccurrences.entries())
    .filter(([, occurrences]) => occurrences.length > 1)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([table, occurrences]) => ({ table, occurrences }));
}

async function collectDuplicateFunctions() {
  const directories = await readDirectoryEntries(
    functionsDir,
    entry => entry.isDirectory() && entry.name !== '_shared',
  );

  const fileHashes = new Map();

  for (const dir of directories) {
    const entryPath = path.join(dir, 'index.ts');
    let content;
    try {
      content = await fs.readFile(entryPath);
    } catch (error) {
      if (error && error.code === 'ENOENT') {
        continue;
      }
      throw error;
    }

    const hash = crypto.createHash('sha256').update(content).digest('hex');
    if (!fileHashes.has(hash)) {
      fileHashes.set(hash, []);
    }
    fileHashes.get(hash).push(path.relative(rootDir, entryPath));
  }

  return Array.from(fileHashes.values())
    .filter(paths => paths.length > 1)
    .map(paths => paths.sort());
}

function printSection(title) {
  console.log(`\n${title}`);
  console.log('-'.repeat(title.length));
}

async function main() {
  console.log('Supabase duplicate audit');
  console.log('==========================');

  const [duplicateTables, duplicateFunctions] = await Promise.all([
    collectDuplicateTables(),
    collectDuplicateFunctions(),
  ]);

  printSection('Table definitions');
  if (duplicateTables.length === 0) {
    console.log('No duplicated table definitions found.');
  } else {
    for (const { table, occurrences } of duplicateTables) {
      console.log(`- ${table}: ${occurrences.join(', ')}`);
    }
  }

  printSection('Edge functions');
  if (duplicateFunctions.length === 0) {
    console.log('No duplicate edge function implementations detected.');
  } else {
    for (const paths of duplicateFunctions) {
      console.log(`- ${paths.join(', ')}`);
    }
  }
}

main().catch(error => {
  console.error('Failed to run duplicate audit:', error);
  process.exitCode = 1;
});
