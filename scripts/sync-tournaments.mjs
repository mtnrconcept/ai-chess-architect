#!/usr/bin/env node

const normaliseEnv = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

const env = process.env;

const projectRef =
  normaliseEnv(env.SUPABASE_PROJECT_ID) ??
  normaliseEnv(env.SUPABASE_PROJECT_REF) ??
  normaliseEnv(env.SUPABASE_REFERENCE_ID) ??
  normaliseEnv(env.VITE_SUPABASE_PROJECT_ID) ??
  normaliseEnv(env.VITE_SUPABASE_PROJECT_REF) ??
  normaliseEnv(env.VITE_SUPABASE_REFERENCE_ID);

const explicitSupabaseUrl = normaliseEnv(env.SUPABASE_URL) ?? normaliseEnv(env.VITE_SUPABASE_URL);
const supabaseUrl = explicitSupabaseUrl ?? (projectRef ? `https://${projectRef}.supabase.co` : undefined);

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
