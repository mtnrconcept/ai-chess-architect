#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const normaliseEnv = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const normaliseEnvLine = (line) => {
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
};

const applyEnvFromFile = (filePath) => {
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
};

const resolveProjectRoot = () => {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(currentFile), '..');
};

const loadEnv = (projectRoot) => {
  const candidateFiles = ['.env.local', '.env'];
  for (const fileName of candidateFiles) {
    applyEnvFromFile(path.join(projectRoot, fileName));
  }
};

loadEnv(resolveProjectRoot());

const env = process.env;

const EXPECTED_PROJECT_ID = 'ucaqbhmyutlnitnedowk';
const EXPECTED_PROJECT_NAME = 'Youaregood';

const configuredProjectRef =
  normaliseEnv(env.SUPABASE_PROJECT_ID) ??
  normaliseEnv(env.SUPABASE_PROJECT_REF) ??
  normaliseEnv(env.SUPABASE_REFERENCE_ID) ??
  normaliseEnv(env.VITE_SUPABASE_PROJECT_ID) ??
  normaliseEnv(env.VITE_SUPABASE_PROJECT_REF) ??
  normaliseEnv(env.VITE_SUPABASE_REFERENCE_ID);
const configuredProjectName =
  normaliseEnv(env.SUPABASE_PROJECT_NAME) ??
  normaliseEnv(env.VITE_SUPABASE_PROJECT_NAME);

const projectRef = configuredProjectRef ?? EXPECTED_PROJECT_ID;
const projectName = configuredProjectName ?? EXPECTED_PROJECT_NAME;

if (configuredProjectRef && configuredProjectRef !== EXPECTED_PROJECT_ID) {
  console.warn(
    `[sync-tournaments] Identifiant Supabase inattendu (${configuredProjectRef}). Utilisation de ${EXPECTED_PROJECT_ID} pour ${EXPECTED_PROJECT_NAME}.`
  );
}

if (!configuredProjectRef) {
  console.log(
    `[sync-tournaments] Aucun identifiant Supabase explicite fourni. Utilisation du projet ${EXPECTED_PROJECT_NAME} (${EXPECTED_PROJECT_ID}).`
  );
}

const explicitSupabaseUrl = normaliseEnv(env.SUPABASE_URL) ?? normaliseEnv(env.VITE_SUPABASE_URL);
const supabaseUrl = explicitSupabaseUrl ?? (projectRef ? `https://${projectRef}.supabase.co` : undefined);

if (supabaseUrl) {
  console.log(`[sync-tournaments] Projet Supabase ${projectName} (${projectRef}) ciblé via ${supabaseUrl}.`);
}

let functionsBase = normaliseEnv(env.SUPABASE_FUNCTIONS_URL);

if (!functionsBase && supabaseUrl) {
  try {
    const url = new URL(supabaseUrl.startsWith('http') ? supabaseUrl : `https://${supabaseUrl}`);
    functionsBase = `${url.protocol}//${url.host.replace('.supabase.co', '.functions.supabase.co')}`;
  } catch (error) {
    console.warn('[sync-tournaments] Invalid SUPABASE_URL format, cannot derive functions URL.');
  }
}

if (!functionsBase && projectRef) {
  functionsBase = `https://${projectRef}.functions.supabase.co`;
}

if (functionsBase && !functionsBase.startsWith('http')) {
  functionsBase = `https://${functionsBase}`;
}

const anonKey =
  normaliseEnv(env.SUPABASE_ANON_KEY) ??
  normaliseEnv(env.SUPABASE_PUBLISHABLE_KEY) ??
  normaliseEnv(env.SUPABASE_PUBLISHABLE_DEFAULT_KEY) ??
  normaliseEnv(env.VITE_SUPABASE_ANON_KEY) ??
  normaliseEnv(env.VITE_SUPABASE_PUBLISHABLE_KEY) ??
  normaliseEnv(env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY) ??
  normaliseEnv(env.VITE_SUPABASE_PUBLIC_ANON_KEY) ??
  normaliseEnv(env.VITE_ANON_KEY);

if (!functionsBase) {
  console.warn('[sync-tournaments] Functions URL unresolved. Skip sync.');
  process.exit(0);
}

if (!anonKey) {
  console.warn('[sync-tournaments] Supabase anon/publishable key missing. Skip sync.');
  process.exit(0);
}

const endpoint = `${functionsBase.replace(/\/+$/, '')}/sync-tournaments`;

const invoke = async () => {
  console.log(`[sync-tournaments] Invoking ${endpoint}`);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        'x-client-info': 'ai-chess-architect-web',
      },
      body: JSON.stringify({}),
    });

    const text = await response.text();
    let payload;
    try {
      payload = text.length > 0 ? JSON.parse(text) : {};
    } catch (parseError) {
      payload = { raw: text };
    }

    if (!response.ok) {
      console.error('[sync-tournaments] Failed:', payload);
      process.exit(1);
    }

    console.log('[sync-tournaments] Success:', payload);
  } catch (error) {
    console.error('[sync-tournaments] Network error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
};

await invoke();
