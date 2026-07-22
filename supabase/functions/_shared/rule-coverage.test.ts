import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import {
  buildRuleCoverageAuditPrompt,
  buildRuleCoverageAuditSystemPrompt,
  buildRuleCoverageEvidencePathManifest,
  buildSignedGuidanceCompilation,
  evaluateRuleCoverage,
  normalizeRuleIntentContract,
  RULE_COVERAGE_AUDIT_SCHEMA,
  RULE_COVERAGE_EVIDENCE_PATH_PATTERN,
  type RuleIntentContract,
} from "./rule-coverage.ts";
import {
  MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH,
  MAX_USER_RULE_PROMPT_LENGTH,
  requireSafeRulePrompt,
  requireSafeSignedRuleCompilerPrompt,
} from "./prompt-security.ts";
import type { RuleBlueprintV2 } from "./rules-v2/index.ts";

const safeTextOfLength = (length: number): string => {
  const fragment = "Le cavalier applique une mécanique bornée et testable. ";
  const value = fragment
    .repeat(Math.ceil(length / fragment.length))
    .slice(0, length);
  return value.endsWith(" ") ? `${value.slice(0, -1)}x` : value;
};

const blueprint: RuleBlueprintV2 = {
  schemaVersion: "2.0.0",
  ruleKey: "frozen-bishop",
  title: "Fou de glace",
  summary: "Le fou peut geler une cible ennemie pendant deux tours.",
  category: "special",
  tags: ["freeze"],
  affectedPieces: ["bishop"],
  sides: ["white", "black"],
  stateNamespace: "rules.frozenBishop",
  initialStateJson: "{}",
  actions: [
    {
      id: "freeze-target",
      label: "Geler",
      description: "Gèle une pièce ennemie.",
      targetingMode: "piece",
      validTilesProvider: "provider.enemyPieces",
      consumesTurn: true,
      cooldownTurns: 3,
      maxPerPiece: 4,
      requiresSelection: true,
      pieceTypes: ["bishop"],
    },
  ],
  triggers: [
    {
      id: "freeze-target-trigger",
      event: "ui.action",
      actionId: "freeze-target",
      priority: 10,
      conditions: [],
      effects: [
        {
          id: "apply-freeze",
          op: "status.add",
          arguments: [],
        },
        {
          id: "play-ice-effect",
          op: "vfx.play",
          arguments: [],
        },
      ],
      onFailure: "blockAction",
      message: "Cible invalide.",
    },
  ],
  balance: {
    powerLevel: 3,
    counterplay: ["Éloigner les pièces du fou."],
    limitations: ["Cooldown de trois tours."],
  },
  explanation: {
    plainLanguage: "Sélectionne un fou puis une cible ennemie pour la geler.",
    examples: ["Le fou gèle une tour ennemie pendant deux tours."],
  },
};

const contract = (approvedAdaptation = ""): RuleIntentContract => ({
  version: 1,
  originalPrompt:
    "Le fou gèle une cible ennemie et joue une animation de glace.",
  requirements: [
    {
      id: "freeze-enemy",
      statement: "Le fou gèle une cible ennemie.",
      importance: "core",
      feasibility: "direct",
      approvedAdaptation: "",
    },
    {
      id: "ice-animation",
      statement: "Une animation de glace accompagne l’effet.",
      importance: "cosmetic",
      feasibility: "adaptable",
      approvedAdaptation,
    },
  ],
  decisions: [],
});

const typedContract = (
  evidenceKind: "logic" | "side-scope",
  expectedSides: Array<"white" | "black">,
): RuleIntentContract => ({
  version: 2,
  originalPrompt: "La règle est réservée exactement aux camps sélectionnés.",
  requirements: [
    {
      id: "typed-requirement",
      statement: "La règle respecte la preuve typée demandée.",
      importance: "core",
      feasibility: "direct",
      approvedAdaptation: "",
      evidenceKind,
      expectedSides,
    },
  ],
  decisions: [],
});

const signedGuidance = (): Record<string, unknown> => ({
  draftPrompt:
    "Le fou gèle une pièce ennemie pendant deux tours avec un cooldown.",
  requirements: [
    {
      id: "freeze-enemy",
      statement: "Le fou gèle une cible ennemie.",
      importance: "core",
      feasibility: "direct",
      adaptation: "",
      evidenceKind: "logic",
      expectedSides: [],
    },
  ],
  questions: [
    {
      id: "freeze-duration",
      question: "Combien de tours dure le gel ?",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        {
          id: "one-turn",
          label: "Un tour",
          description: "Gel court.",
          expectedSides: [],
        },
        {
          id: "two-turns",
          label: "Deux tours",
          description: "Gel équilibré.",
          expectedSides: [],
        },
        {
          id: "three-turns",
          label: "Trois tours",
          description: "Gel long.",
          expectedSides: [],
        },
      ],
    },
    {
      id: "freeze-cooldown",
      question: "Quel délai de récupération appliquer ?",
      selectionMode: "single",
      minSelections: 1,
      maxSelections: 1,
      choices: [
        {
          id: "two-turns",
          label: "Deux tours",
          description: "Délai court.",
          expectedSides: [],
        },
        {
          id: "three-turns",
          label: "Trois tours",
          description: "Délai équilibré.",
          expectedSides: [],
        },
        {
          id: "four-turns",
          label: "Quatre tours",
          description: "Délai prudent.",
          expectedSides: [],
        },
      ],
    },
  ],
  adjustments: [],
  remainingUncertainty: [],
});

Deno.test(
  "rule-coverage: partage une grammaire stricte pour les preuves",
  () => {
    const evidenceSchema =
      RULE_COVERAGE_AUDIT_SCHEMA.properties.requirements.items.properties
        .evidencePaths;
    assertEquals(
      evidenceSchema.items.pattern,
      RULE_COVERAGE_EVIDENCE_PATH_PATTERN,
    );

    const pattern = new RegExp(RULE_COVERAGE_EVIDENCE_PATH_PATTERN);
    for (const path of [
      "$.sides",
      "$.actions[0]",
      "$.triggers[12]",
      "$.triggers[1].conditions[2]",
      "$.triggers[1].effects[2]",
    ]) {
      assert(pattern.test(path), path);
    }
    for (const path of [
      "$.actions[0].cooldownTurns",
      "$.triggers[0].effects[0].op",
      "$.triggers[0].effects[0].arguments[0]",
      "$.logic.effects[0]",
      "$.triggers[*]",
      "$.triggers[1000]",
    ]) {
      assert(!pattern.test(path), path);
    }
  },
);

Deno.test(
  "rule-coverage: fournit le manifeste exact des preuves disponibles",
  () => {
    const manifest = buildRuleCoverageEvidencePathManifest(blueprint);
    assertEquals(manifest, [
      "$.sides",
      "$.actions[0]",
      "$.triggers[0]",
      "$.triggers[0].effects[0]",
      "$.triggers[0].effects[1]",
    ]);

    const prompt = buildRuleCoverageAuditPrompt({
      contract: contract(),
      blueprint,
    });
    for (const path of manifest) assert(prompt.includes(path), path);
    assert(prompt.includes("<BLUEPRINT_V2_VALIDE>"));
    assert(prompt.includes("<CHEMINS_PREUVE_AUTORISES>"));
    assert(!prompt.includes("<BLUEPRINT_COMPILE>"));

    const systemPrompt = buildRuleCoverageAuditSystemPrompt();
    assert(systemPrompt.includes("au moins un evidencePath"));
    assert(systemPrompt.includes("$.triggers[N].conditions[M]"));
    assert(systemPrompt.includes("Ne suffixe jamais"));
  },
);

Deno.test("rule-coverage: bloque une adaptation non approuvée", () => {
  const result = evaluateRuleCoverage({
    contract: contract(),
    blueprint,
    audit: {
      exactIntentPreserved: false,
      summary: "La mécanique est présente mais l’animation a été adaptée.",
      requirements: [
        {
          id: "freeze-enemy",
          status: "implemented",
          evidencePaths: ["$.triggers[0].effects[0]"],
          explanation: "Le statut de gel est appliqué par le trigger.",
          adaptation: "",
          userApproved: false,
        },
        {
          id: "ice-animation",
          status: "adapted",
          evidencePaths: ["$.triggers[0].effects[0]"],
          explanation: "L’effet visuel utilise le mécanisme disponible.",
          adaptation: "Effet visuel générique.",
          userApproved: true,
        },
      ],
    },
  });

  assert(!result.assessment.complete);
  assertEquals(result.assessment.score, 75);
  assert(
    result.diagnostics.some(
      (item) => item.code === "COVERAGE_ADAPTATION_NOT_APPROVED",
    ),
  );
});

Deno.test(
  "rule-coverage: accepte uniquement une adaptation explicitement approuvée",
  () => {
    const result = evaluateRuleCoverage({
      contract: contract("Utiliser l’effet visuel géré disponible."),
      blueprint,
      audit: {
        exactIntentPreserved: false,
        summary: "Toutes les exigences sont couvertes.",
        requirements: [
          {
            id: "freeze-enemy",
            status: "implemented",
            evidencePaths: ["$.triggers[0].effects[0]"],
            explanation: "Le statut de gel est appliqué.",
            adaptation: "",
            userApproved: false,
          },
          {
            id: "ice-animation",
            status: "adapted",
            evidencePaths: ["$.triggers[0].effects[1]"],
            explanation: "L’animation gérée accompagne le trigger.",
            adaptation: "Utiliser l’effet visuel géré disponible.",
            userApproved: true,
          },
        ],
      },
    });

    assert(result.assessment.complete);
    assert(!result.assessment.exactIntentPreserved);
    assertEquals(result.assessment.score, 100);
    assertEquals(result.diagnostics, []);
  },
);

Deno.test(
  "rule-coverage: refuse une adaptation différente de celle approuvée",
  () => {
    const result = evaluateRuleCoverage({
      contract: {
        ...contract("Utiliser l’effet visuel géré disponible."),
        requirements: [
          contract("Utiliser l’effet visuel géré disponible.").requirements[1],
        ],
      },
      blueprint,
      audit: {
        exactIntentPreserved: false,
        summary: "L’audit tente de substituer une autre adaptation.",
        requirements: [
          {
            id: "ice-animation",
            status: "adapted",
            evidencePaths: ["$.triggers[0].effects[1]"],
            explanation: "Une autre animation a été utilisée.",
            adaptation: "Supprimer entièrement l’animation.",
            userApproved: true,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_ADAPTATION_NOT_APPROVED",
    );
  },
);

Deno.test(
  "rule-coverage: refuse un statut implemented qui masque une adaptation",
  () => {
    const approvedAdaptation = "Utiliser l’effet visuel géré disponible.";
    const result = evaluateRuleCoverage({
      contract: {
        ...contract(approvedAdaptation),
        requirements: [contract(approvedAdaptation).requirements[1]],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary:
          "L’audit prétend que l’adaptation est une implémentation exacte.",
        requirements: [
          {
            id: "ice-animation",
            status: "implemented",
            evidencePaths: ["$.triggers[0].effects[1]"],
            explanation: "Une animation gérée remplace l’effet demandé.",
            adaptation: approvedAdaptation,
            userApproved: true,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assert(!result.assessment.exactIntentPreserved);
    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_IMPLEMENTATION_STATUS_INVALID",
    );
  },
);

Deno.test(
  "rule-coverage: une description seule ne prouve pas une mécanique",
  () => {
    const result = evaluateRuleCoverage({
      contract: {
        ...contract(),
        requirements: [contract().requirements[0]],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "Couverture annoncée sans logique.",
        requirements: [
          {
            id: "freeze-enemy",
            status: "implemented",
            evidencePaths: ["$.explanation.plainLanguage"],
            explanation: "La description affirme que la règle existe.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assertEquals(result.diagnostics[0]?.code, "COVERAGE_EVIDENCE_PATH_INVALID");
  },
);

Deno.test(
  "rule-coverage: refuse tout mélange de preuves valides et invalides",
  () => {
    const result = evaluateRuleCoverage({
      contract: {
        ...contract(),
        requirements: [contract().requirements[0]],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "Une preuve valide masque une preuve feuille invalide.",
        requirements: [
          {
            id: "freeze-enemy",
            status: "implemented",
            evidencePaths: [
              "$.triggers[0].effects[0]",
              "$.triggers[0].effects[0].op",
            ],
            explanation: "Le trigger applique le statut.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assertEquals(result.assessment.score, 0);
    assertEquals(result.assessment.requirements[0].evidencePaths, []);
    assertEquals(result.diagnostics[0]?.code, "COVERAGE_EVIDENCE_PATH_INVALID");
  },
);

for (const [label, evidencePaths] of [
  ["doublon", ["$.actions[0]", "$.actions[0]"]],
  ["espace périphérique", [" $.actions[0]"]],
  ["indice hors limites", ["$.actions[9]"]],
  ["valeur non textuelle", [42]],
  ["plus de huit chemins", Array.from({ length: 9 }, () => "$.actions[0]")],
] as Array<[string, unknown[]]>) {
  Deno.test(`rule-coverage: refuse une preuve invalide (${label})`, () => {
    const result = evaluateRuleCoverage({
      contract: {
        ...contract(),
        requirements: [contract().requirements[0]],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "La preuve est structurellement invalide.",
        requirements: [
          {
            id: "freeze-enemy",
            status: "implemented",
            evidencePaths,
            explanation: "Preuve de test invalide.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assertEquals(result.diagnostics[0]?.code, "COVERAGE_EVIDENCE_PATH_INVALID");
  });
}

Deno.test(
  "rule-coverage: distingue une preuve vide d'une preuve invalide",
  () => {
    const result = evaluateRuleCoverage({
      contract: {
        ...contract(),
        requirements: [contract().requirements[0]],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "Aucune preuve n'est fournie.",
        requirements: [
          {
            id: "freeze-enemy",
            status: "implemented",
            evidencePaths: [],
            explanation: "Aucune preuve disponible.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assertEquals(result.diagnostics[0]?.code, "COVERAGE_EVIDENCE_MISSING");
  },
);

Deno.test("rule-coverage: refuse les identifiants dupliqués", () => {
  assertThrows(
    () =>
      normalizeRuleIntentContract(
        {
          originalPrompt: "Une règle assez longue pour être validée.",
          requirements: [
            {
              id: "same-id",
              statement: "Première exigence.",
              importance: "core",
              feasibility: "direct",
              approvedAdaptation: "",
            },
            {
              id: "same-id",
              statement: "Deuxième exigence.",
              importance: "supporting",
              feasibility: "direct",
              approvedAdaptation: "",
            },
          ],
          decisions: [],
        },
        "Une règle assez longue pour être validée.",
      ),
    Error,
    "INTENT_CONTRACT_REQUIREMENT_INVALID",
  );
});

Deno.test(
  "rule-coverage: transforme chaque réponse signée en exigence auditée",
  () => {
    const result = buildSignedGuidanceCompilation({
      originalPrompt: "Le fou gèle une cible ennemie pendant deux tours.",
      guidance: signedGuidance(),
      selections: {
        answers: {
          "freeze-duration": ["two-turns"],
          "freeze-cooldown": ["three-turns"],
        },
        acceptedAdjustmentIds: [],
      },
    });

    assertEquals(result.contract.requirements.length, 4);
    assert(
      result.contract.requirements.some(
        (item) =>
          item.id.startsWith("decision-") &&
          item.statement.includes("Gel équilibré"),
      ),
    );
    assert(
      result.compilerPrompt.length <= MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH,
    );
  },
);

Deno.test(
  "rule-coverage: accepte prompt utilisateur et draft de 6000 caractères",
  () => {
    const originalPrompt = safeTextOfLength(MAX_USER_RULE_PROMPT_LENGTH);
    const guidance = signedGuidance();
    guidance.draftPrompt = safeTextOfLength(MAX_USER_RULE_PROMPT_LENGTH);

    const result = buildSignedGuidanceCompilation({
      originalPrompt,
      guidance,
      selections: {
        answers: {
          "freeze-duration": ["two-turns"],
          "freeze-cooldown": ["three-turns"],
        },
        acceptedAdjustmentIds: [],
      },
    });

    assertEquals(
      result.contract.originalPrompt.length,
      MAX_USER_RULE_PROMPT_LENGTH,
    );
    assert(result.compilerPrompt.length > MAX_USER_RULE_PROMPT_LENGTH);
    assert(
      result.compilerPrompt.length <= MAX_SIGNED_RULE_COMPILER_PROMPT_LENGTH,
    );
    assert(requireSafeRulePrompt(originalPrompt).safe);
    const firstPass = requireSafeSignedRuleCompilerPrompt(
      result.compilerPrompt,
    );
    assert(firstPass.safe);
    assert(requireSafeSignedRuleCompilerPrompt(firstPass.sanitizedPrompt).safe);
  },
);

Deno.test(
  "rule-coverage: refuse un questionnaire signé ambigu ou tronqué",
  () => {
    const tooManyRequirements = signedGuidance();
    tooManyRequirements.requirements = Array.from(
      { length: 21 },
      (_, index) => ({
        id: `requirement-${index + 1}`,
        statement: `Exigence indépendante numéro ${index + 1}.`,
        importance: "core",
        feasibility: "direct",
        adaptation: "",
        evidenceKind: "logic",
        expectedSides: [],
      }),
    );

    assertThrows(
      () =>
        buildSignedGuidanceCompilation({
          originalPrompt:
            "Une variante comporte plus de vingt clauses indépendantes.",
          guidance: tooManyRequirements,
          selections: {
            answers: {
              "freeze-duration": ["two-turns"],
              "freeze-cooldown": ["three-turns"],
            },
            acceptedAdjustmentIds: [],
          },
        }),
      Error,
      "SIGNED_GUIDANCE_INVALID",
    );

    const duplicateQuestion = signedGuidance();
    const questions = duplicateQuestion.questions as Array<
      Record<string, unknown>
    >;
    questions[1] = { ...questions[1], id: "freeze-duration" };
    assertThrows(
      () =>
        buildSignedGuidanceCompilation({
          originalPrompt: "Le fou gèle une cible ennemie pendant deux tours.",
          guidance: duplicateQuestion,
          selections: {
            answers: { "freeze-duration": ["two-turns"] },
            acceptedAdjustmentIds: [],
          },
        }),
      Error,
      "SIGNED_GUIDANCE_QUESTION_INVALID",
    );
  },
);

Deno.test(
  "rule-coverage: conserve les contrats historiques v1 sans preuve typée",
  () => {
    const normalized = normalizeRuleIntentContract(
      {
        version: 1,
        originalPrompt:
          "Une règle historique suffisamment longue pour être valide.",
        requirements: [
          {
            id: "historical-rule",
            statement: "La règle historique reste lisible.",
            importance: "core",
            feasibility: "direct",
            approvedAdaptation: "",
            evidenceKind: "side-scope",
            expectedSides: ["white"],
          },
        ],
        decisions: [],
      },
      "Une règle historique suffisamment longue pour être valide.",
    );

    assertEquals(normalized.version, 1);
    assertEquals(normalized.requirements[0].evidenceKind, undefined);
    assertEquals(normalized.requirements[0].expectedSides, undefined);
  },
);

Deno.test(
  "rule-coverage: normalise un contrat v2 avec preuve typée",
  () => {
    const normalized = normalizeRuleIntentContract(
      {
        version: 2,
        originalPrompt: "La règle est réservée exactement aux pièces blanches.",
        requirements: [
          {
            id: "white-only",
            statement: "Seules les pièces blanches utilisent la règle.",
            importance: "core",
            feasibility: "direct",
            approvedAdaptation: "",
            evidenceKind: "side-scope",
            expectedSides: ["white"],
          },
        ],
        decisions: [],
      },
      "La règle est réservée exactement aux pièces blanches.",
    );

    assertEquals(normalized.version, 2);
    assertEquals(normalized.requirements[0].evidenceKind, "side-scope");
    assertEquals(normalized.requirements[0].expectedSides, ["white"]);
  },
);

Deno.test(
  "rule-coverage: refuse un contrat v2 dont la preuve typée est incohérente",
  () => {
    assertThrows(
      () =>
        normalizeRuleIntentContract(
          {
            version: 2,
            originalPrompt:
              "La logique doit être prouvée par un trigger exact.",
            requirements: [
              {
                id: "logic-only",
                statement: "Le trigger applique la mécanique demandée.",
                importance: "core",
                feasibility: "direct",
                approvedAdaptation: "",
                evidenceKind: "logic",
                expectedSides: ["white"],
              },
            ],
            decisions: [],
          },
          "La logique doit être prouvée par un trigger exact.",
        ),
      Error,
      "INTENT_CONTRACT_REQUIREMENT_INVALID",
    );
  },
);

Deno.test(
  "rule-coverage: refuse un contrat v2 privé de son type de preuve",
  () => {
    const result = evaluateRuleCoverage({
      contract: {
        version: 2,
        originalPrompt:
          "La mécanique doit être prouvée par une action autoritaire.",
        requirements: [
          {
            id: "missing-evidence-contract",
            statement: "Une action autoritaire applique la mécanique.",
            importance: "core",
            feasibility: "direct",
            approvedAdaptation: "",
          },
        ],
        decisions: [],
      },
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary:
          "Une action est présente mais le contrat de preuve est absent.",
        requirements: [
          {
            id: "missing-evidence-contract",
            status: "implemented",
            evidencePaths: ["$.actions[0]"],
            explanation: "L’action existe dans le blueprint.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_EVIDENCE_CONTRACT_INVALID",
    );
  },
);

Deno.test(
  "rule-coverage: accepte une preuve de portée mono-camp exacte",
  () => {
    const result = evaluateRuleCoverage({
      contract: typedContract("side-scope", ["white"]),
      blueprint: { ...blueprint, sides: ["white"] },
      audit: {
        exactIntentPreserved: true,
        summary: "La portée blanche est exactement celle du blueprint.",
        requirements: [
          {
            id: "typed-requirement",
            status: "implemented",
            evidencePaths: ["$.sides"],
            explanation: "Le champ sides limite la règle aux blancs.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assert(result.assessment.complete);
    assertEquals(result.diagnostics, []);
  },
);

Deno.test(
  "rule-coverage: refuse une portée qui ne correspond pas exactement",
  () => {
    const result = evaluateRuleCoverage({
      contract: typedContract("side-scope", ["white"]),
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "La portée annoncée ne correspond pas au blueprint.",
        requirements: [
          {
            id: "typed-requirement",
            status: "implemented",
            evidencePaths: ["$.sides"],
            explanation: "Le blueprint contient deux camps.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assert(!result.assessment.complete);
    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_SIDE_SCOPE_MISMATCH",
    );
  },
);

Deno.test(
  "rule-coverage: une action seule ne prouve pas une portée de camps",
  () => {
    const result = evaluateRuleCoverage({
      contract: typedContract("side-scope", ["white", "black"]),
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "Une action est proposée comme preuve de portée.",
        requirements: [
          {
            id: "typed-requirement",
            status: "implemented",
            evidencePaths: ["$.actions[0]"],
            explanation: "L’action existe mais ne prouve pas les camps.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_SIDE_SCOPE_EVIDENCE_REQUIRED",
    );
  },
);

Deno.test(
  "rule-coverage: une preuve logique ne peut pas utiliser le champ sides",
  () => {
    const result = evaluateRuleCoverage({
      contract: typedContract("logic", []),
      blueprint,
      audit: {
        exactIntentPreserved: true,
        summary: "La portée est proposée comme preuve de logique.",
        requirements: [
          {
            id: "typed-requirement",
            status: "implemented",
            evidencePaths: ["$.sides"],
            explanation: "Le champ sides ne prouve aucune mécanique.",
            adaptation: "",
            userApproved: false,
          },
        ],
      },
    });

    assertEquals(
      result.diagnostics[0]?.code,
      "COVERAGE_LOGIC_EVIDENCE_REQUIRED",
    );
  },
);

Deno.test(
  "rule-coverage: propage et canonise la portée des choix signés",
  () => {
    const guidance = signedGuidance();
    const questions = guidance.questions as Array<Record<string, unknown>>;
    questions[0].selectionMode = "multiple";
    questions[0].maxSelections = 2;
    const choices = questions[0].choices as Array<Record<string, unknown>>;
    choices[0].expectedSides = ["black"];
    choices[1].expectedSides = ["white"];
    choices[2].expectedSides = ["black", "white"];

    const result = buildSignedGuidanceCompilation({
      originalPrompt: "Le fou gèle une cible pour les camps choisis.",
      guidance,
      selections: {
        answers: {
          "freeze-duration": ["one-turn", "two-turns"],
          "freeze-cooldown": ["three-turns"],
        },
        acceptedAdjustmentIds: [],
      },
    });

    assertEquals(result.contract.version, 2);
    assertEquals(result.contract.requirements[0].evidenceKind, "logic");
    assertEquals(result.contract.requirements[0].expectedSides, []);
    const firstDecision = result.contract.requirements.find((requirement) =>
      requirement.id.startsWith("decision-1-"),
    );
    assertEquals(firstDecision?.evidenceKind, "side-scope");
    assertEquals(firstDecision?.expectedSides, ["white", "black"]);
    const secondDecision = result.contract.requirements.find((requirement) =>
      requirement.id.startsWith("decision-2-"),
    );
    assertEquals(secondDecision?.evidenceKind, "logic");
    assertEquals(secondDecision?.expectedSides, []);
    const fidelity = result.contract.requirements.find(
      (requirement) => requirement.id === "request-fidelity",
    );
    assertEquals(fidelity?.evidenceKind, "logic");
    assertEquals(fidelity?.expectedSides, []);
  },
);

Deno.test(
  "rule-coverage: refuse une question qui mélange des choix avec et sans portée",
  () => {
    const guidance = signedGuidance();
    const questions = guidance.questions as Array<Record<string, unknown>>;
    const choices = questions[0].choices as Array<Record<string, unknown>>;
    choices[0].expectedSides = ["white"];

    assertThrows(
      () =>
        buildSignedGuidanceCompilation({
          originalPrompt: "Le fou gèle une cible pour un camp sélectionné.",
          guidance,
          selections: {
            answers: {
              "freeze-duration": ["one-turn"],
              "freeze-cooldown": ["three-turns"],
            },
            acceptedAdjustmentIds: [],
          },
        }),
      Error,
      "SIGNED_GUIDANCE_CHOICE_SCOPE_MISMATCH",
    );
  },
);
