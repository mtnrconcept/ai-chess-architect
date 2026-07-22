import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  decorateLegacyGuidanceDraft,
  extractLegacyGuidanceSessionId,
  LEGACY_GUIDANCE_FINAL_SENTINEL,
  LEGACY_GUIDANCE_COMPAT_SUNSET_MS,
  LEGACY_GUIDANCE_PROMPT_MAX_CHARS,
  legacyGuidanceCompatEnabled,
  prepareLegacyCompatibleGuidance,
  recoverLegacyGuidanceSelections,
  renderLegacyGuidedPrompt,
  requireUsableLegacyGuidanceSession,
  type LegacyGuidanceSessionRow,
} from "./legacy-guidance-compat.ts";
import { buildSignedGuidanceCompilation } from "./rule-coverage.ts";
import { sha256Hex } from "./rules-v2/index.ts";

const SESSION_ID = "d0000000-0000-4000-8000-000000001601";
const USER_ID = "d0000000-0000-4000-8000-000000001600";

const guidance = (): Record<string, unknown> => ({
  feasibility: "adaptable",
  summary: "Le fou gèle une cible et utilise un effet visuel géré.",
  draftPrompt:
    "Le fou gèle une pièce ennemie pendant deux tours avec un cooldown de trois tours.",
  requirements: [
    {
      id: "freeze-target",
      statement: "Le fou gèle une cible ennemie.",
      importance: "core",
      feasibility: "direct",
      adaptation: "",
    },
    {
      id: "ice-animation",
      statement: "Une animation de glace accompagne le gel.",
      importance: "cosmetic",
      feasibility: "adaptable",
      adaptation: "Utiliser une animation gérée par le moteur.",
    },
  ],
  questions: [
    {
      id: "duration",
      question: "Combien de tours dure le gel ?",
      help: "La durée borne la puissance.",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        {
          id: "one",
          label: "Un tour",
          description: "Durée courte.",
          recommended: true,
        },
        {
          id: "two",
          label: "Deux tours",
          description: "Durée équilibrée.",
          recommended: true,
        },
        {
          id: "three",
          label: "Trois tours",
          description: "Durée longue.",
          recommended: false,
        },
      ],
    },
    {
      id: "cooldown",
      question: "Quel cooldown appliquer ?",
      help: "Le cooldown limite la fréquence.",
      selectionMode: "multiple",
      minSelections: 1,
      maxSelections: 2,
      choices: [
        {
          id: "two",
          label: "Deux tours",
          description: "Délai court.",
          recommended: true,
        },
        {
          id: "three",
          label: "Trois tours",
          description: "Délai équilibré.",
          recommended: true,
        },
        {
          id: "four",
          label: "Quatre tours",
          description: "Délai prudent.",
          recommended: false,
        },
      ],
    },
  ],
  adjustments: [
    {
      id: "managed-animation",
      label: "Animation gérée",
      description: "Utiliser une animation gérée par le moteur.",
      recommended: true,
      requirementIds: ["ice-animation"],
    },
  ],
  remainingUncertainty: [],
});

const selected = {
  answers: {
    duration: ["two"],
    cooldown: ["two", "four"],
  },
  acceptedAdjustmentIds: ["managed-animation"],
};

const renderedPrompt = () => {
  const prepared = prepareLegacyCompatibleGuidance(guidance());
  return {
    prepared,
    prompt: renderLegacyGuidedPrompt({
      draftPrompt: decorateLegacyGuidanceDraft(SESSION_ID),
      guidance: prepared,
      selections: selected,
    }),
  };
};

Deno.test(
  "legacy-guidance-compat: reproduit exactement le builder 9fe465 sans valeurs présélectionnées",
  () => {
    const { prepared, prompt } = renderedPrompt();
    assertEquals(
      prepared.questions.every((question) =>
        question.choices.every((choice) => choice.recommended === false),
      ),
      true,
    );
    assertEquals(
      prepared.adjustments.every(
        (adjustment) => adjustment.recommended === false,
      ),
      true,
    );
    assertEquals(extractLegacyGuidanceSessionId(prompt), SESSION_ID);
    assertEquals(
      recoverLegacyGuidanceSelections({
        prompt,
        sessionId: SESSION_ID,
        guidance: prepared,
      }),
      selected,
    );
    assertEquals(
      prompt,
      `[[VOLTUS-GUIDANCE:v1:d0000000-0000-4000-8000-000000001601]]

Décisions confirmées par l’utilisateur :
- Combien de tours dure le gel ? Deux tours
- Quel cooldown appliquer ? Deux tours ; Quatre tours

Ajustements acceptés pour rendre la variante jouable :
- Animation gérée — Utiliser une animation gérée par le moteur.

Préserve l’intention originale. Lorsque deux décisions se contredisent, privilégie les choix confirmés ci-dessus. Produis une variante jouable avec limites, contre-jeu et exemples concrets.`,
    );
    assertEquals(prompt.endsWith(LEGACY_GUIDANCE_FINAL_SENTINEL), true);
  },
);

Deno.test(
  "legacy-guidance-compat: le coupe-circuit ferme au plus tard au sunset",
  () => {
    assertEquals(
      legacyGuidanceCompatEnabled(LEGACY_GUIDANCE_COMPAT_SUNSET_MS - 1, ""),
      true,
    );
    assertEquals(
      legacyGuidanceCompatEnabled(
        LEGACY_GUIDANCE_COMPAT_SUNSET_MS - 1,
        "false",
      ),
      false,
    );
    assertEquals(
      legacyGuidanceCompatEnabled(LEGACY_GUIDANCE_COMPAT_SUNSET_MS, "true"),
      false,
    );
  },
);

Deno.test(
  "legacy-guidance-compat: transforme les choix récupérés en contrat signé et rejouable",
  async () => {
    const { prepared, prompt } = renderedPrompt();
    const recovered = recoverLegacyGuidanceSelections({
      prompt,
      sessionId: SESSION_ID,
      guidance: prepared,
    });
    const first = buildSignedGuidanceCompilation({
      originalPrompt:
        "Le fou gèle une cible ennemie et joue une animation de glace.",
      guidance: prepared,
      selections: recovered,
    });
    const replay = buildSignedGuidanceCompilation({
      originalPrompt:
        "Le fou gèle une cible ennemie et joue une animation de glace.",
      guidance: prepared,
      selections: recoverLegacyGuidanceSelections({
        prompt,
        sessionId: SESSION_ID,
        guidance: prepared,
      }),
    });
    assertEquals(first, replay);
    assertEquals(
      first.contract.requirements.find(
        (requirement) => requirement.id === "ice-animation",
      )?.approvedAdaptation,
      "Utiliser une animation gérée par le moteur.",
    );
    assertEquals(
      await sha256Hex({
        prompt: first.compilerPrompt,
        intentContract: first.contract,
        selections: first.selections,
      }),
      await sha256Hex({
        prompt: replay.compilerPrompt,
        intentContract: replay.contract,
        selections: replay.selections,
      }),
    );
  },
);

Deno.test(
  "legacy-guidance-compat: ne déduit jamais une adaptation non cochée",
  () => {
    const prepared = prepareLegacyCompatibleGuidance(guidance());
    const prompt = renderLegacyGuidedPrompt({
      draftPrompt: decorateLegacyGuidanceDraft(SESSION_ID),
      guidance: prepared,
      selections: { ...selected, acceptedAdjustmentIds: [] },
    });
    const recovered = recoverLegacyGuidanceSelections({
      prompt,
      sessionId: SESSION_ID,
      guidance: prepared,
    });
    assertEquals(recovered.acceptedAdjustmentIds, []);
    assertThrows(
      () =>
        buildSignedGuidanceCompilation({
          originalPrompt:
            "Le fou gèle une cible ennemie et joue une animation de glace.",
          guidance: prepared,
          selections: recovered,
        }),
      Error,
      "GUIDANCE_ADJUSTMENT_REQUIRED",
    );
  },
);

Deno.test(
  "legacy-guidance-compat: refuse altération, mauvais marqueur et troncation",
  () => {
    const { prepared, prompt } = renderedPrompt();
    assertThrows(
      () =>
        recoverLegacyGuidanceSelections({
          prompt: prompt.replace(
            "Deux tours ; Quatre tours",
            "Deux tours ; Choix inconnu",
          ),
          sessionId: SESSION_ID,
          guidance: prepared,
        }),
      Error,
    );
    assertThrows(
      () =>
        recoverLegacyGuidanceSelections({
          prompt,
          sessionId: "d0000000-0000-4000-8000-000000001699",
          guidance: prepared,
        }),
      Error,
      "GUIDANCE_LEGACY_SESSION_MISMATCH",
    );
    assertThrows(
      () => extractLegacyGuidanceSessionId(prompt.slice(0, -1)),
      Error,
      "GUIDANCE_LEGACY_PROMPT_INVALID",
    );
    const forcedTruncation =
      `${prompt.slice(0, -LEGACY_GUIDANCE_FINAL_SENTINEL.length)}` +
      "x".repeat(LEGACY_GUIDANCE_PROMPT_MAX_CHARS) +
      LEGACY_GUIDANCE_FINAL_SENTINEL;
    assertThrows(
      () => extractLegacyGuidanceSessionId(forcedTruncation),
      Error,
      "GUIDANCE_LEGACY_PROMPT_INVALID",
    );
  },
);

Deno.test(
  "legacy-guidance-compat: refuse session inconnue, autre utilisateur et expiration",
  () => {
    const now = Date.parse("2026-07-22T12:30:00.000Z");
    const row: LegacyGuidanceSessionRow = {
      id: SESSION_ID,
      user_id: USER_ID,
      guidance_token: "payload.signature",
      created_at: "2026-07-22T12:00:00.000Z",
      expires_at: "2026-07-22T13:00:00.000Z",
    };
    assertEquals(
      requireUsableLegacyGuidanceSession({
        row,
        sessionId: SESSION_ID,
        userId: USER_ID,
        nowMs: now,
      }),
      row.guidance_token,
    );
    assertThrows(
      () =>
        requireUsableLegacyGuidanceSession({
          row: null,
          sessionId: SESSION_ID,
          userId: USER_ID,
          nowMs: now,
        }),
      Error,
      "GUIDANCE_LEGACY_SESSION_NOT_FOUND",
    );
    assertThrows(
      () =>
        requireUsableLegacyGuidanceSession({
          row,
          sessionId: SESSION_ID,
          userId: "d0000000-0000-4000-8000-000000001699",
          nowMs: now,
        }),
      Error,
      "GUIDANCE_LEGACY_SESSION_INVALID",
    );
    assertThrows(
      () =>
        requireUsableLegacyGuidanceSession({
          row,
          sessionId: SESSION_ID,
          userId: USER_ID,
          nowMs: Date.parse("2026-07-22T13:00:00.000Z"),
        }),
      Error,
      "GUIDANCE_LEGACY_SESSION_INVALID",
    );
  },
);

Deno.test(
  "legacy-guidance-compat: exige des libellés et questions non ambigus",
  () => {
    const duplicateQuestion = guidance();
    const questions = duplicateQuestion.questions as Array<
      Record<string, unknown>
    >;
    questions[1] = {
      ...questions[1],
      question: questions[0].question,
    };
    assertThrows(
      () => prepareLegacyCompatibleGuidance(duplicateQuestion),
      Error,
      "GUIDANCE_LEGACY_QUESTION_DUPLICATED",
    );

    const duplicateLabel = guidance();
    const firstQuestion = (
      duplicateLabel.questions as Array<Record<string, unknown>>
    )[0];
    const choices = firstQuestion.choices as Array<Record<string, unknown>>;
    choices[1] = { ...choices[1], label: choices[0].label };
    assertThrows(
      () => prepareLegacyCompatibleGuidance(duplicateLabel),
      Error,
      "GUIDANCE_LEGACY_CHOICE_DUPLICATED",
    );

    const ambiguousAdjustment = guidance();
    ambiguousAdjustment.adjustments = [
      {
        id: "first",
        label: "AA",
        description: "BB — CCC",
        recommended: false,
        requirementIds: ["ice-animation"],
      },
      {
        id: "second",
        label: "AA — BB",
        description: "CCC",
        recommended: false,
        requirementIds: ["ice-animation"],
      },
    ];
    assertThrows(
      () => prepareLegacyCompatibleGuidance(ambiguousAdjustment),
      Error,
      "GUIDANCE_LEGACY_ADJUSTMENT_AMBIGUOUS",
    );
  },
);

Deno.test(
  "legacy-guidance-compat: refuse toute incertitude que le client 9fe465 ne bloque pas",
  () => {
    const uncertain = guidance();
    uncertain.remainingUncertainty = [
      "La cible exacte de l’animation reste indéterminée.",
    ];
    assertThrows(
      () => prepareLegacyCompatibleGuidance(uncertain),
      Error,
      "GUIDANCE_LEGACY_UNCERTAINTY_REMAINS",
    );
  },
);
