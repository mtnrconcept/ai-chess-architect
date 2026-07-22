import { assertEquals, assertThrows } from "jsr:@std/assert@1";
import { validateGuidance } from "./rule-guidance-validation.ts";

const directGuidance = (): Record<string, unknown> => ({
  feasibility: "direct",
  summary: "Le fou gèle une cible pendant deux tours.",
  draftPrompt: "Le fou gèle une cible pendant deux tours avec un cooldown.",
  requirements: [
    {
      id: "freeze-target",
      statement: "Le fou gèle une cible ennemie.",
      importance: "core",
      feasibility: "direct",
      adaptation: "",
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
        { id: "one", label: "Un tour", description: "Durée courte." },
        { id: "two", label: "Deux tours", description: "Durée moyenne." },
        { id: "three", label: "Trois tours", description: "Durée longue." },
      ],
    },
    {
      id: "cooldown",
      question: "Quel cooldown appliquer ?",
      help: "Le cooldown limite la fréquence.",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        { id: "two", label: "Deux tours", description: "Délai court." },
        { id: "three", label: "Trois tours", description: "Délai moyen." },
        { id: "four", label: "Quatre tours", description: "Délai long." },
      ],
    },
  ],
  adjustments: [],
  remainingUncertainty: [],
});

Deno.test(
  "rule-guidance-validation: accepte une guidance directe sans ajustement",
  () => {
    const guidance = directGuidance();
    assertEquals(validateGuidance(guidance), guidance);
  },
);

for (const feasibility of ["adaptable", "unsupported"] as const) {
  Deno.test(
    `rule-guidance-validation: refuse une exigence ${feasibility} sans ajustement`,
    () => {
      const guidance = directGuidance();
      guidance.feasibility = feasibility;
      guidance.requirements = [
        {
          id: "managed-animation",
          statement: "Une cinématique accompagne la capture.",
          importance: "cosmetic",
          feasibility,
          adaptation: "Utiliser une animation gérée par le moteur.",
        },
      ];

      assertThrows(
        () => validateGuidance(guidance),
        Error,
        "GUIDANCE_ADJUSTMENT_REQUIRED",
      );
    },
  );
}

Deno.test(
  "rule-guidance-validation: accepte un ajustement cohérent et relié",
  () => {
    const guidance = directGuidance();
    guidance.feasibility = "adaptable";
    guidance.requirements = [
      {
        id: "managed-animation",
        statement: "Une cinématique accompagne la capture.",
        importance: "cosmetic",
        feasibility: "adaptable",
        adaptation: "Utiliser une animation gérée par le moteur.",
      },
    ];
    guidance.adjustments = [
      {
        id: "use-managed-animation",
        label: "Animation gérée",
        description: "Remplacer la vidéo libre par une animation gérée.",
        recommended: true,
        requirementIds: ["managed-animation"],
      },
    ];

    assertEquals(validateGuidance(guidance), guidance);
  },
);

Deno.test(
  "rule-guidance-validation: refuse un lien vide présenté comme ajustement",
  () => {
    const guidance = directGuidance();
    guidance.feasibility = "adaptable";
    guidance.requirements = [
      {
        id: "managed-animation",
        statement: "Une cinématique accompagne la capture.",
        importance: "cosmetic",
        feasibility: "adaptable",
        adaptation: "Utiliser une animation gérée par le moteur.",
      },
    ];
    guidance.adjustments = [
      {
        id: "empty-adjustment",
        label: "Ajustement vide",
        description: " ",
        recommended: false,
        requirementIds: ["managed-animation"],
      },
    ];

    assertThrows(
      () => validateGuidance(guidance),
      Error,
      "GUIDANCE_ADJUSTMENT_INVALID",
    );
  },
);

Deno.test(
  "rule-guidance-validation: recalcule la faisabilité globale depuis les exigences",
  () => {
    const guidance = directGuidance();
    guidance.feasibility = "adaptable";

    assertThrows(
      () => validateGuidance(guidance),
      Error,
      "GUIDANCE_FEASIBILITY_MISMATCH",
    );
  },
);

Deno.test(
  "rule-guidance-validation: refuse d'adapter une exigence déclarée directe",
  () => {
    const guidance = directGuidance();
    const requirements = guidance.requirements as Array<
      Record<string, unknown>
    >;
    requirements[0].adaptation = "Utiliser un délai partagé.";

    assertThrows(
      () => validateGuidance(guidance),
      Error,
      "GUIDANCE_DIRECT_ADAPTATION_INVALID",
    );
  },
);

Deno.test(
  "rule-guidance-validation: refuse un ajustement relié à une exigence directe",
  () => {
    const guidance = directGuidance();
    guidance.adjustments = [
      {
        id: "shared-cooldown",
        label: "Cooldown partagé",
        description: "Remplacer la limite par pièce par une limite partagée.",
        recommended: false,
        requirementIds: ["freeze-target"],
      },
    ];

    assertThrows(
      () => validateGuidance(guidance),
      Error,
      "GUIDANCE_ADJUSTMENT_REQUIREMENT_DIRECT",
    );
  },
);
