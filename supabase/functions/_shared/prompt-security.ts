const MAX_RULE_PROMPT_LENGTH = 6_000;

const BIDI_AND_ZERO_WIDTH = /[\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/g;
const DISALLOWED_CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const HTML_TAG = /<\/?[a-z][^>]{0,500}>/gi;
const UNTRUSTED_URI =
  /\b(?:https?|ftp|file|gopher|data|javascript):(?:\/\/)?[^\s<>{}\[\]"']{1,2048}/gi;
const MANAGED_RESOURCE_ID =
  /\bcinematic\.(?:carry|swoop|burst)\.asset_[0-9a-f]{40}\.(?:png|jpg|webp)\b/gi;

interface ThreatRule {
  code: string;
  score: number;
  pattern: RegExp;
}

const THREAT_RULES: readonly ThreatRule[] = [
  {
    code: "role-override",
    score: 4,
    pattern:
      /\b(?:ignore|disregard|forget|bypass|override|replace|annule|ignorez|oublie|contourne|remplace)\b[\s\S]{0,100}\b(?:previous|prior|above|system|developer|instructions?|consignes?|règles?)\b/i,
  },
  {
    code: "prompt-exfiltration",
    score: 4,
    pattern:
      /\b(?:reveal|show|print|repeat|dump|expose|révèle|affiche|imprime|répète|divulgue)\b[\s\S]{0,100}\b(?:system prompt|developer message|hidden instructions?|secret(?:s)?|api key|service[_ -]?role|clé api|consignes? cachées?)\b/i,
  },
  {
    code: "code-execution",
    score: 4,
    pattern:
      /\b(?:eval\s*\(|new\s+Function\s*\(|child_process|Deno\.(?:run|Command)|Bun\.spawn|process\.env|document\.cookie|localStorage|sessionStorage|javascript:|data:text\/html|<script\b|onerror\s*=|onload\s*=)/i,
  },
  {
    code: "secret-access",
    score: 4,
    pattern:
      /\b(?:OPENAI_API_KEY|SUPABASE_SERVICE_ROLE_KEY|SERVICE_ROLE|DATABASE_URL|JWT_SECRET|PRIVATE_KEY|VITE_SUPABASE_ANON_KEY)\b/i,
  },
  {
    code: "private-network",
    score: 4,
    pattern:
      /\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|169\.254\.169\.254|metadata\.google\.internal|host\.docker\.internal|\[?::1\]?|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})\b/i,
  },
  {
    code: "network-directive",
    score: 4,
    pattern:
      /\b(?:fetch|curl|wget|axios|XMLHttpRequest|open a socket|ouvre une socket|requête réseau|appel réseau)\b[\s\S]{0,120}\b(?:https?|file|gopher|localhost|metadata|url|endpoint|api)\b/i,
  },
  {
    code: "server-catalogue-forgery",
    score: 4,
    pattern:
      /(?:<\/?ASSET_CATALOGUE_SERVEUR>|\bASSET_CATALOGUE_SERVEUR\b|\bCATALOGUE_D_ASSETS_SERVEUR\b)/i,
  },
  {
    code: "prompt-delimiter",
    score: 4,
    pattern:
      /(?:^|\n)\s*(?:system|developer|assistant|tool|function)\s*(?:message)?\s*[:>]|<\|(?:system|developer|assistant|tool)\|>|\[\s*(?:system|developer|assistant|tool)\s*\]/i,
  },
  {
    code: "encoded-payload",
    score: 4,
    pattern:
      /(?:\b[A-Za-z0-9+/]{300,}={0,2}\b|\b(?:0x)?[0-9a-fA-F]{400,}\b)/,
  },
];

export interface PromptSecurityAssessment {
  safe: boolean;
  sanitizedPrompt: string;
  score: number;
  reasons: string[];
  removedUrlCount: number;
  removedManagedResourceCount: number;
}

export class PromptSecurityError extends Error {
  readonly code = "PROMPT_SECURITY_REJECTED";
  readonly reasons: string[];

  constructor(reasons: string[]) {
    super("La demande contient des instructions techniques non autorisées.");
    this.name = "PromptSecurityError";
    this.reasons = [...reasons];
  }
}

const unique = <T>(items: T[]): T[] => [...new Set(items)];

export function assessRulePromptSecurity(
  rawPrompt: string,
): PromptSecurityAssessment {
  const reasons: string[] = [];
  let score = 0;

  const normalized = String(rawPrompt ?? "").normalize("NFKC");
  if (normalized.length > MAX_RULE_PROMPT_LENGTH) {
    reasons.push("oversized-prompt");
    score += 4;
  }

  const bounded = normalized.slice(0, MAX_RULE_PROMPT_LENGTH);

  BIDI_AND_ZERO_WIDTH.lastIndex = 0;
  if (BIDI_AND_ZERO_WIDTH.test(bounded)) {
    reasons.push("hidden-directionality");
    score += 1;
  }
  BIDI_AND_ZERO_WIDTH.lastIndex = 0;

  const inspectionText = bounded
    .replace(BIDI_AND_ZERO_WIDTH, "")
    .replace(DISALLOWED_CONTROL, " ");

  // Inspect the original semantic content before URL, HTML and resource-ID
  // redaction. Otherwise a malicious URI or forged server block could be
  // removed before the detector sees it.
  for (const rule of THREAT_RULES) {
    rule.pattern.lastIndex = 0;
    if (!rule.pattern.test(inspectionText)) continue;
    reasons.push(rule.code);
    score += rule.score;
  }

  let sanitizedPrompt = inspectionText.replace(HTML_TAG, " ");

  const urlMatches = sanitizedPrompt.match(UNTRUSTED_URI) ?? [];
  UNTRUSTED_URI.lastIndex = 0;
  sanitizedPrompt = sanitizedPrompt.replace(
    UNTRUSTED_URI,
    "[URL EXTERNE SUPPRIMÉE]",
  );

  const managedResourceMatches = sanitizedPrompt.match(MANAGED_RESOURCE_ID) ?? [];
  MANAGED_RESOURCE_ID.lastIndex = 0;
  sanitizedPrompt = sanitizedPrompt.replace(
    MANAGED_RESOURCE_ID,
    "[IDENTIFIANT D’ASSET GÉRÉ SUPPRIMÉ]",
  );

  sanitizedPrompt = sanitizedPrompt
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!sanitizedPrompt) {
    reasons.push("empty-prompt");
    score += 4;
  }

  return {
    safe: score < 4,
    sanitizedPrompt,
    score,
    reasons: unique(reasons),
    removedUrlCount: urlMatches.length,
    removedManagedResourceCount: managedResourceMatches.length,
  };
}

export function requireSafeRulePrompt(rawPrompt: string): PromptSecurityAssessment {
  const assessment = assessRulePromptSecurity(rawPrompt);
  if (!assessment.safe) {
    throw new PromptSecurityError(assessment.reasons);
  }
  return assessment;
}
