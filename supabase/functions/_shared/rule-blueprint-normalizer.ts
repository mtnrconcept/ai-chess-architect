const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const cleanText = (value: unknown, fallback: string, min = 1, max = 1200) => {
  const candidate = typeof value === "string" ? value.trim() : "";
  const selected = candidate.length >= min ? candidate : fallback;
  return selected.slice(0, max);
};

const cleanTextArray = (
  value: unknown,
  fallback: string[],
  minLength: number,
  maxItems: number,
  maxTextLength: number,
): string[] => {
  const values = Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim().slice(0, maxTextLength))
        .filter((item) => item.length >= minLength)
    : [];

  return Array.from(new Set(values)).slice(0, maxItems).length > 0
    ? Array.from(new Set(values)).slice(0, maxItems)
    : fallback;
};

export interface BlueprintNormalizationResult {
  value: unknown;
  normalizedFields: string[];
}

/**
 * Repairs only descriptive fields that cannot alter authoritative game logic.
 * Actions, triggers, conditions, effects, tokens and state are never invented.
 */
export function normalizeRuleBlueprintCandidate(
  candidate: unknown,
  originalPrompt: string,
): BlueprintNormalizationResult {
  if (!isRecord(candidate)) {
    return { value: candidate, normalizedFields: [] };
  }

  const value = structuredClone(candidate) as Record<string, unknown>;
  const normalizedFields: string[] = [];
  const titleFallback = "Variante personnalisée";
  const title = cleanText(value.title, titleFallback, 3, 100);
  if (title !== value.title) {
    value.title = title;
    normalizedFields.push("$.title");
  }

  const promptSummary = cleanText(
    originalPrompt,
    "Variante personnalisée créée à partir de la demande du joueur.",
    10,
    500,
  );
  const summary = cleanText(value.summary, promptSummary, 10, 600);
  if (summary !== value.summary) {
    value.summary = summary;
    normalizedFields.push("$.summary");
  }

  const explanation = isRecord(value.explanation)
    ? { ...value.explanation }
    : {};
  if (!isRecord(value.explanation)) normalizedFields.push("$.explanation");

  const plainLanguage = cleanText(
    explanation.plainLanguage,
    `Cette variante applique l’idée suivante : ${promptSummary}`,
    20,
    1200,
  );
  if (plainLanguage !== explanation.plainLanguage) {
    explanation.plainLanguage = plainLanguage;
    normalizedFields.push("$.explanation.plainLanguage");
  }

  const examples = cleanTextArray(
    explanation.examples,
    [
      `Exemple : au moment prévu par la règle, l’effet s’applique à la cible valide choisie.`,
      `Exemple : si les conditions ne sont pas réunies, le coup normal reste inchangé.`,
    ],
    5,
    6,
    400,
  );
  const previousExamples = Array.isArray(explanation.examples)
    ? explanation.examples
    : [];
  if (JSON.stringify(examples) !== JSON.stringify(previousExamples)) {
    explanation.examples = examples;
    normalizedFields.push("$.explanation.examples");
  }
  value.explanation = explanation;

  const balance = isRecord(value.balance) ? { ...value.balance } : {};
  if (!isRecord(value.balance)) normalizedFields.push("$.balance");

  const powerLevel =
    typeof balance.powerLevel === "number" &&
    Number.isInteger(balance.powerLevel) &&
    balance.powerLevel >= 1 &&
    balance.powerLevel <= 5
      ? balance.powerLevel
      : 3;
  if (powerLevel !== balance.powerLevel) {
    balance.powerLevel = powerLevel;
    normalizedFields.push("$.balance.powerLevel");
  }

  const counterplay = cleanTextArray(
    balance.counterplay,
    ["L’adversaire peut éviter la cible ou attendre la fin du cooldown."],
    3,
    8,
    240,
  );
  if (JSON.stringify(counterplay) !== JSON.stringify(balance.counterplay ?? [])) {
    balance.counterplay = counterplay;
    normalizedFields.push("$.balance.counterplay");
  }

  const limitations = cleanTextArray(
    balance.limitations,
    ["La règle respecte les cibles valides et les limites du moteur."],
    3,
    8,
    240,
  );
  if (JSON.stringify(limitations) !== JSON.stringify(balance.limitations ?? [])) {
    balance.limitations = limitations;
    normalizedFields.push("$.balance.limitations");
  }
  value.balance = balance;

  if (!Array.isArray(value.tags)) {
    value.tags = [];
    normalizedFields.push("$.tags");
  } else {
    const tags = cleanTextArray(value.tags, [], 1, 12, 40);
    if (JSON.stringify(tags) !== JSON.stringify(value.tags)) {
      value.tags = tags;
      normalizedFields.push("$.tags");
    }
  }

  return { value, normalizedFields };
}
