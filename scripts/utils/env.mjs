import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function normaliseEnvLine(line) {
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
}

function applyEnvFromFile(filePath) {
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
}

export function loadEnv(projectRoot, candidateFiles = ['.env.local', '.env']) {
  for (const fileName of candidateFiles) {
    applyEnvFromFile(path.join(projectRoot, fileName));
  }
}
