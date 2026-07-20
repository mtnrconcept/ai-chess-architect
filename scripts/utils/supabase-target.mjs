const PROJECT_REF_PATTERN = /^[a-z0-9]{15,40}$/;

const envValue = (value) => {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
};

export const resolveSupabaseProjectRef = (env = process.env) =>
  envValue(env.SUPABASE_PROJECT_ID) ??
  envValue(env.SUPABASE_PROJECT_REF);

const targetContainsProjectRef = (targetUrl, projectRef) => {
  try {
    const url = new URL(targetUrl);
    const host = url.hostname.toLowerCase();
    const username = decodeURIComponent(url.username).toLowerCase();
    const expectedRef = projectRef.toLowerCase();

    if (url.protocol === 'https:') {
      return (
        host === `${expectedRef}.supabase.co` &&
        url.username === '' &&
        url.password === ''
      );
    }

    if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
      return false;
    }

    const isDirectDatabase =
      host === `db.${expectedRef}.supabase.co` &&
      username === 'postgres';
    const isPooler = host.endsWith('.pooler.supabase.com') &&
      username === `postgres.${expectedRef}`;

    return isDirectDatabase || isPooler;
  } catch {
    return false;
  }
};

export const assertConfirmedSupabaseTarget = ({
  targetUrl,
  label,
  env = process.env,
}) => {
  const projectRef = resolveSupabaseProjectRef(env);
  const confirmation = envValue(
    env.SUPABASE_PROJECT_REF_CONFIRMATION,
  );

  if (!projectRef || !PROJECT_REF_PATTERN.test(projectRef)) {
    throw new Error(
      `${label}: SUPABASE_PROJECT_ID (ou SUPABASE_PROJECT_REF) explicite et valide requis.`,
    );
  }

  if (confirmation !== projectRef) {
    throw new Error(
      `${label}: SUPABASE_PROJECT_REF_CONFIRMATION doit correspondre exactement au projet ciblé.`,
    );
  }

  if (!targetUrl || !targetContainsProjectRef(targetUrl, projectRef)) {
    throw new Error(
      `${label}: l'URL cible ne correspond pas au projet et au protocole confirmés; opération refusée.`,
    );
  }

  return projectRef;
};
