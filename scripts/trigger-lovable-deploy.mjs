#!/usr/bin/env node
import process from 'node:process';

const HOOK_ENV_KEYS = ["LOVABLE_DEPLOY_HOOK", "LOVABLE_DEPLOY_URL", "LOVABLE_DEPLOY_ENDPOINT"];
const hookUrl = HOOK_ENV_KEYS.map((key) => process.env[key]).find(Boolean);

if (!hookUrl) {
  console.log("[lovable] Aucun webhook de déploiement configuré (définis LOVABLE_DEPLOY_HOOK).");
  process.exit(0);
}

const method = (process.env.LOVABLE_DEPLOY_METHOD ?? 'POST').toUpperCase();
const timeoutMs = Number.parseInt(process.env.LOVABLE_DEPLOY_TIMEOUT_MS ?? '15000', 10);

if (Number.isNaN(timeoutMs) || timeoutMs <= 0) {
  console.error('[lovable] LOVABLE_DEPLOY_TIMEOUT_MS doit être un entier strictement positif.');
  process.exit(1);
}

let headers = {};
const headerEnv = process.env.LOVABLE_DEPLOY_HEADERS;
if (headerEnv) {
  try {
    headers = JSON.parse(headerEnv);
    if (headers === null || typeof headers !== 'object' || Array.isArray(headers)) {
      throw new Error('Headers must be an object');
    }
  } catch (error) {
    console.error('[lovable] Impossible d\'analyser LOVABLE_DEPLOY_HEADERS (JSON invalide):', error.message);
    process.exit(1);
  }
}

const secret = process.env.LOVABLE_DEPLOY_SECRET;
if (secret) {
  headers = { ...headers, Authorization: `Bearer ${secret}` };
}

const body = process.env.LOVABLE_DEPLOY_BODY;
const shouldSendBody = !['GET', 'HEAD'].includes(method) && typeof body === 'string' && body.length > 0;

if (body && !shouldSendBody) {
  console.warn(`[lovable] Corps ignoré car la méthode ${method} ne supporte pas d\'envoi.`);
}

const buildTimeoutSignal = () => {
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
};

const signal = buildTimeoutSignal();

console.log(`[lovable] Déclenchement du hook (${method} ${hookUrl})…`);

try {
  const response = await fetch(hookUrl, {
    method,
    headers,
    body: shouldSendBody ? body : undefined,
    signal,
  });

  const text = await response.text();
  const snippet = text ? text.slice(0, 512) : '';

  if (!response.ok) {
    console.error(`[lovable] Le hook a renvoyé ${response.status} ${response.statusText}.`, snippet);
    process.exit(1);
  }

  if (snippet) {
    console.log(`[lovable] Réponse: ${snippet}`);
  }

  console.log('[lovable] Déploiement Lovable déclenché avec succès.');
} catch (error) {
  if (error.name === 'TimeoutError') {
    console.error(`[lovable] Le hook n\'a pas répondu après ${timeoutMs}ms.`);
  } else {
    console.error('[lovable] Échec lors de l\'appel du hook Lovable:', error);
  }
  process.exit(1);
}
