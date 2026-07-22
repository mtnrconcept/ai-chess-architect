export const LEGACY_GUIDANCE_PROMPT_MAX_CHARS = 12_000;
export const LEGACY_GUIDANCE_SESSION_TTL_SECONDS = 60 * 60;
export const LEGACY_GUIDANCE_COMPAT_SUNSET_MS = Date.parse(
  "2026-07-30T00:00:00.000Z",
);

export const LEGACY_GUIDANCE_FINAL_SENTINEL =
  "Préserve l’intention originale. Lorsque deux décisions se contredisent, privilégie les choix confirmés ci-dessus. Produis une variante jouable avec limites, contre-jeu et exemples concrets.";

const LEGACY_DECISIONS_HEADING = "Décisions confirmées par l’utilisateur :";
const LEGACY_ADJUSTMENTS_HEADING =
  "Ajustements acceptés pour rendre la variante jouable :";
const UUID_V4_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MARKER_PATTERN =
  /^\[\[VOLTUS-GUIDANCE:v1:([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})\]\]\n/i;

type JsonRecord = Record<string, unknown>;

interface LegacyChoice extends JsonRecord {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

interface LegacyQuestion extends JsonRecord {
  id: string;
  question: string;
  selectionMode: "single" | "multiple";
  minSelections: number;
  maxSelections: number;
  choices: LegacyChoice[];
}

interface LegacyAdjustment extends JsonRecord {
  id: string;
  label: string;
  description: string;
  recommended: boolean;
}

export interface LegacyCompatibleGuidance extends JsonRecord {
  draftPrompt: string;
  questions: LegacyQuestion[];
  adjustments: LegacyAdjustment[];
}

export interface LegacyGuidanceSelections {
  answers: Record<string, string[]>;
  acceptedAdjustmentIds: string[];
}

export interface LegacyGuidanceSessionRow {
  id: string;
  user_id: string;
  guidance_token: string;
  created_at: string;
  expires_at: string;
}

const isRecord = (value: unknown): value is JsonRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const legacyGuidanceCompatEnabled = (
  nowMs = Date.now(),
  configuredValue = Deno.env.get("RULE_LEGACY_GUIDANCE_COMPAT_ENABLED"),
): boolean => {
  const configured = configuredValue?.trim().toLowerCase();
  return (
    nowMs < LEGACY_GUIDANCE_COMPAT_SUNSET_MS &&
    (configured === undefined || configured === "" || configured === "true")
  );
};

const canonicalKey = (value: string): string =>
  value.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();

const requireSingleLine = (
  value: unknown,
  minLength: number,
  code: string,
): string => {
  if (typeof value !== "string") throw new Error(code);
  const normalized = value.trim();
  if (normalized.length < minLength || /[\r\n]/.test(normalized)) {
    throw new Error(code);
  }
  return normalized;
};

const combinations = (length: number, min: number, max: number): number[][] => {
  const result: number[][] = [];
  for (let mask = 1; mask < 1 << length; mask += 1) {
    const indexes: number[] = [];
    for (let index = 0; index < length; index += 1) {
      if ((mask & (1 << index)) !== 0) indexes.push(index);
    }
    if (indexes.length >= min && indexes.length <= max) result.push(indexes);
  }
  return result;
};

export const legacyGuidanceMarker = (sessionId: string): string => {
  if (!UUID_V4_PATTERN.test(sessionId)) {
    throw new Error("GUIDANCE_LEGACY_SESSION_ID_INVALID");
  }
  return `[[VOLTUS-GUIDANCE:v1:${sessionId}]]`;
};

export const decorateLegacyGuidanceDraft = (sessionId: string): string =>
  legacyGuidanceMarker(sessionId);

export const renderLegacyGuidedPrompt = (input: {
  draftPrompt: string;
  guidance: LegacyCompatibleGuidance;
  selections: LegacyGuidanceSelections;
}): string => {
  const answers = input.guidance.questions.flatMap((question) => {
    const selected = new Set(input.selections.answers[question.id] ?? []);
    const labels = question.choices
      .filter((choice) => selected.has(choice.id))
      .map((choice) => choice.label);

    return labels.length > 0
      ? [`${question.question} ${labels.join(" ; ")}`]
      : [];
  });

  const accepted = new Set(input.selections.acceptedAdjustmentIds);
  const adjustments = input.guidance.adjustments
    .filter((adjustment) => accepted.has(adjustment.id))
    .map((adjustment) => `${adjustment.label} — ${adjustment.description}`);

  return [
    input.draftPrompt.trim(),
    answers.length > 0
      ? `\n${LEGACY_DECISIONS_HEADING}\n- ${answers.join("\n- ")}`
      : "",
    adjustments.length > 0
      ? `\n${LEGACY_ADJUSTMENTS_HEADING}\n- ${adjustments.join("\n- ")}`
      : "",
    `\n${LEGACY_GUIDANCE_FINAL_SENTINEL}`,
  ]
    .filter(Boolean)
    .join("\n");
};

/**
 * Canonicalizes only renderer-facing model text and removes all recommended
 * defaults. The production 9fe465 client selects recommended values on load;
 * returning false therefore makes every transmitted choice an explicit click.
 */
export const prepareLegacyCompatibleGuidance = (
  value: unknown,
): LegacyCompatibleGuidance => {
  if (!isRecord(value)) {
    throw new Error("GUIDANCE_LEGACY_CONTRACT_INVALID");
  }
  const draftPrompt =
    typeof value.draftPrompt === "string" ? value.draftPrompt.trim() : "";
  if (draftPrompt.length < 20 || draftPrompt.includes("[[VOLTUS-GUIDANCE:")) {
    throw new Error("GUIDANCE_LEGACY_DRAFT_INVALID");
  }
  if (!Array.isArray(value.questions) || value.questions.length < 2) {
    throw new Error("GUIDANCE_LEGACY_QUESTIONS_INVALID");
  }
  if (!Array.isArray(value.adjustments)) {
    throw new Error("GUIDANCE_LEGACY_ADJUSTMENTS_INVALID");
  }
  if (
    !Array.isArray(value.remainingUncertainty) ||
    value.remainingUncertainty.length > 0
  ) {
    throw new Error("GUIDANCE_LEGACY_UNCERTAINTY_REMAINS");
  }

  const questionKeys = new Set<string>();
  const questions: LegacyQuestion[] = value.questions.map((rawQuestion) => {
    if (!isRecord(rawQuestion) || !Array.isArray(rawQuestion.choices)) {
      throw new Error("GUIDANCE_LEGACY_QUESTION_INVALID");
    }
    const id = requireSingleLine(
      rawQuestion.id,
      2,
      "GUIDANCE_LEGACY_QUESTION_INVALID",
    );
    const question = requireSingleLine(
      rawQuestion.question,
      5,
      "GUIDANCE_LEGACY_QUESTION_INVALID",
    );
    const questionKey = canonicalKey(question);
    if (questionKeys.has(questionKey)) {
      throw new Error("GUIDANCE_LEGACY_QUESTION_DUPLICATED");
    }
    questionKeys.add(questionKey);

    const minSelections = Number(rawQuestion.minSelections);
    const maxSelections = Number(rawQuestion.maxSelections);
    if (
      !Number.isInteger(minSelections) ||
      !Number.isInteger(maxSelections) ||
      minSelections < 1 ||
      maxSelections < minSelections ||
      maxSelections > rawQuestion.choices.length ||
      (rawQuestion.selectionMode !== "single" &&
        rawQuestion.selectionMode !== "multiple")
    ) {
      throw new Error("GUIDANCE_LEGACY_QUESTION_INVALID");
    }

    const labelKeys = new Set<string>();
    const choices: LegacyChoice[] = rawQuestion.choices.map((rawChoice) => {
      if (!isRecord(rawChoice)) {
        throw new Error("GUIDANCE_LEGACY_CHOICE_INVALID");
      }
      const choiceId = requireSingleLine(
        rawChoice.id,
        2,
        "GUIDANCE_LEGACY_CHOICE_INVALID",
      );
      const label = requireSingleLine(
        rawChoice.label,
        2,
        "GUIDANCE_LEGACY_CHOICE_INVALID",
      );
      if (label.includes(" ; ")) {
        throw new Error("GUIDANCE_LEGACY_CHOICE_AMBIGUOUS");
      }
      const labelKey = canonicalKey(label);
      if (labelKeys.has(labelKey)) {
        throw new Error("GUIDANCE_LEGACY_CHOICE_DUPLICATED");
      }
      labelKeys.add(labelKey);

      return {
        ...rawChoice,
        id: choiceId,
        label,
        description: requireSingleLine(
          rawChoice.description,
          3,
          "GUIDANCE_LEGACY_CHOICE_INVALID",
        ),
        recommended: false,
      };
    });

    return {
      ...rawQuestion,
      id,
      question,
      selectionMode: rawQuestion.selectionMode,
      minSelections,
      maxSelections,
      choices,
    };
  });

  const adjustmentKeys = new Set<string>();
  const adjustmentRenderings = new Set<string>();
  const adjustments: LegacyAdjustment[] = value.adjustments.map(
    (rawAdjustment) => {
      if (!isRecord(rawAdjustment)) {
        throw new Error("GUIDANCE_LEGACY_ADJUSTMENT_INVALID");
      }
      const id = requireSingleLine(
        rawAdjustment.id,
        2,
        "GUIDANCE_LEGACY_ADJUSTMENT_INVALID",
      );
      const label = requireSingleLine(
        rawAdjustment.label,
        2,
        "GUIDANCE_LEGACY_ADJUSTMENT_INVALID",
      );
      const description = requireSingleLine(
        rawAdjustment.description,
        3,
        "GUIDANCE_LEGACY_ADJUSTMENT_INVALID",
      );
      const adjustmentKey = canonicalKey(label);
      if (adjustmentKeys.has(adjustmentKey)) {
        throw new Error("GUIDANCE_LEGACY_ADJUSTMENT_DUPLICATED");
      }
      adjustmentKeys.add(adjustmentKey);
      const renderedAdjustment = `${label} — ${description}`;
      if (adjustmentRenderings.has(renderedAdjustment)) {
        throw new Error("GUIDANCE_LEGACY_ADJUSTMENT_AMBIGUOUS");
      }
      adjustmentRenderings.add(renderedAdjustment);
      return {
        ...rawAdjustment,
        id,
        label,
        description,
        recommended: false,
      };
    },
  );

  const prepared = {
    ...value,
    draftPrompt,
    questions,
    adjustments,
  } as LegacyCompatibleGuidance;

  const longestAnswers: Record<string, string[]> = {};
  for (const question of questions) {
    longestAnswers[question.id] = question.choices
      .map((choice, index) => ({
        id: choice.id,
        length: choice.label.length,
        index,
      }))
      .sort(
        (left, right) => right.length - left.length || left.index - right.index,
      )
      .slice(0, question.maxSelections)
      .map((choice) => choice.id);
  }
  const maximumPrompt = renderLegacyGuidedPrompt({
    draftPrompt: decorateLegacyGuidanceDraft(
      "00000000-0000-4000-8000-000000000000",
    ),
    guidance: prepared,
    selections: {
      answers: longestAnswers,
      acceptedAdjustmentIds: adjustments.map((adjustment) => adjustment.id),
    },
  });
  if (maximumPrompt.length >= LEGACY_GUIDANCE_PROMPT_MAX_CHARS) {
    throw new Error("GUIDANCE_LEGACY_RENDER_TOO_LARGE");
  }

  return prepared;
};

export const extractLegacyGuidanceSessionId = (prompt: unknown): string => {
  if (
    typeof prompt !== "string" ||
    prompt.length < LEGACY_GUIDANCE_FINAL_SENTINEL.length ||
    prompt.length >= LEGACY_GUIDANCE_PROMPT_MAX_CHARS ||
    prompt.includes(String.fromCharCode(0)) ||
    !prompt.endsWith(LEGACY_GUIDANCE_FINAL_SENTINEL)
  ) {
    throw new Error("GUIDANCE_LEGACY_PROMPT_INVALID");
  }
  const match = prompt.match(MARKER_PATTERN);
  if (!match) throw new Error("GUIDANCE_LEGACY_MARKER_REQUIRED");
  return match[1];
};

const matchQuestionAnswer = (
  question: LegacyQuestion,
  rendered: string,
): string[] => {
  const matches = combinations(
    question.choices.length,
    question.minSelections,
    question.maxSelections,
  ).filter((indexes) => {
    const labels = indexes.map((index) => question.choices[index].label);
    return `${question.question} ${labels.join(" ; ")}` === rendered;
  });
  if (matches.length !== 1) {
    throw new Error("GUIDANCE_LEGACY_ANSWER_INVALID");
  }
  return matches[0].map((index) => question.choices[index].id);
};

export const recoverLegacyGuidanceSelections = (input: {
  prompt: string;
  sessionId: string;
  guidance: unknown;
}): LegacyGuidanceSelections => {
  const extractedSessionId = extractLegacyGuidanceSessionId(input.prompt);
  if (extractedSessionId !== input.sessionId) {
    throw new Error("GUIDANCE_LEGACY_SESSION_MISMATCH");
  }
  const guidance = prepareLegacyCompatibleGuidance(input.guidance);
  const draftPrompt = decorateLegacyGuidanceDraft(input.sessionId);
  const decisionsPrefix = `${draftPrompt}\n\n${LEGACY_DECISIONS_HEADING}\n- `;
  const sentinelSuffix = `\n\n${LEGACY_GUIDANCE_FINAL_SENTINEL}`;
  if (
    !input.prompt.startsWith(decisionsPrefix) ||
    !input.prompt.endsWith(sentinelSuffix)
  ) {
    throw new Error("GUIDANCE_LEGACY_PROMPT_TAMPERED");
  }

  const content = input.prompt.slice(
    decisionsPrefix.length,
    -sentinelSuffix.length,
  );
  const adjustmentSeparator = `\n\n${LEGACY_ADJUSTMENTS_HEADING}\n- `;
  const adjustmentIndex = content.indexOf(adjustmentSeparator);
  if (
    adjustmentIndex >= 0 &&
    content.indexOf(adjustmentSeparator, adjustmentIndex + 1) >= 0
  ) {
    throw new Error("GUIDANCE_LEGACY_PROMPT_TAMPERED");
  }
  const answersText =
    adjustmentIndex < 0 ? content : content.slice(0, adjustmentIndex);
  const adjustmentsText =
    adjustmentIndex < 0
      ? ""
      : content.slice(adjustmentIndex + adjustmentSeparator.length);
  const answerLines = answersText.split("\n- ");
  if (answerLines.length !== guidance.questions.length) {
    throw new Error("GUIDANCE_LEGACY_ANSWERS_MISSING");
  }

  const answers: Record<string, string[]> = {};
  guidance.questions.forEach((question, index) => {
    answers[question.id] = matchQuestionAnswer(question, answerLines[index]);
  });

  const acceptedAdjustmentIds: string[] = [];
  if (adjustmentsText) {
    let previousIndex = -1;
    for (const rendered of adjustmentsText.split("\n- ")) {
      const index = guidance.adjustments.findIndex(
        (adjustment) =>
          `${adjustment.label} — ${adjustment.description}` === rendered,
      );
      if (index <= previousIndex) {
        throw new Error("GUIDANCE_LEGACY_ADJUSTMENT_SELECTION_INVALID");
      }
      previousIndex = index;
      acceptedAdjustmentIds.push(guidance.adjustments[index].id);
    }
  }

  const selections = { answers, acceptedAdjustmentIds };
  const canonicalPrompt = renderLegacyGuidedPrompt({
    draftPrompt,
    guidance,
    selections,
  });
  if (canonicalPrompt !== input.prompt) {
    throw new Error("GUIDANCE_LEGACY_PROMPT_TAMPERED");
  }
  return selections;
};

export const requireUsableLegacyGuidanceSession = (input: {
  row: LegacyGuidanceSessionRow | null;
  sessionId: string;
  userId: string;
  nowMs?: number;
}): string => {
  const row = input.row;
  const now = input.nowMs ?? Date.now();
  if (!row) throw new Error("GUIDANCE_LEGACY_SESSION_NOT_FOUND");
  const createdAt = Date.parse(row.created_at);
  const expiresAt = Date.parse(row.expires_at);
  if (
    row.id !== input.sessionId ||
    row.user_id !== input.userId ||
    !UUID_V4_PATTERN.test(row.id) ||
    !Number.isFinite(createdAt) ||
    !Number.isFinite(expiresAt) ||
    createdAt > now + 60_000 ||
    expiresAt <= now ||
    expiresAt - createdAt > LEGACY_GUIDANCE_SESSION_TTL_SECONDS * 1_000 ||
    typeof row.guidance_token !== "string" ||
    row.guidance_token.length < 1 ||
    row.guidance_token.length > 60_000
  ) {
    throw new Error("GUIDANCE_LEGACY_SESSION_INVALID");
  }
  return row.guidance_token;
};
