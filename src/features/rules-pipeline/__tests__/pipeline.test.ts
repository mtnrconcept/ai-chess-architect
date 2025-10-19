import { describe, expect, it } from "vitest";
import { generateRulePipeline } from "../index";

const scenarios = [
  {
    instruction:
      "Quand un pion se déplace, il laisse une mine sur sa case d'arrivée.",
    templateId: "pawn_mines",
    expectedAction: "hazard.spawn",
  },
  {
    instruction:
      "Le fou peut se téléporter instantanément sur n'importe quelle case qu'il voit.",
    templateId: "bishop_blink",
    expectedAction: "piece.teleport",
  },
  {
    instruction:
      "La reine tire un missile de glace qui gèle la première cible ennemie touchée.",
    templateId: "queen_ice_missile",
    expectedAction: "projectile.spawn",
  },
  {
    instruction:
      "Le cavalier invoque des sables mouvants autour de sa position pour piéger.",
    templateId: "knight_quicksand",
    expectedAction: "hazard.spawn",
  },
  {
    instruction:
      "Un pion peut construire une muraille temporaire devant lui pour bloquer.",
    templateId: "pawn_wall",
    expectedAction: "hazard.spawn",
  },
  {
    instruction: "Le cavalier se métamorphose en archer spécialisé à distance.",
    templateId: "knight_archer",
    expectedAction: "piece.morph",
  },
  {
    instruction:
      "Le fou échange la position de deux pièces ennemies dans ses diagonales.",
    templateId: "bishop_swap",
    expectedAction: "piece.swap",
  },
  {
    instruction:
      "Chaque pièce peut poser une dynamite, une seule fois par partie, qui explose après deux tours.",
    templateId: "dynamite_once",
    expectedAction: "hazard.spawn",
  },
  {
    instruction:
      "Déploie une colle gluante qui ralentit tours, fous et dames dans une zone.",
    templateId: "glue_slow",
    expectedAction: "hazard.spawn",
  },
] as const;

describe("rules pipeline", () => {
  scenarios.forEach((scenario) => {
    it(`génère une règle pour ${scenario.templateId}`, () => {
      const result = generateRulePipeline(scenario.instruction);
      expect(result.intent.templateId).toBe(scenario.templateId);
      expect(result.validation.isValid).toBe(true);
      expect(result.dryRun.passed).toBe(true);
      const planHasAction = result.plan.some((step) =>
        step.actions.some(
          (action) => action.action === scenario.expectedAction,
        ),
      );
      expect(planHasAction).toBe(true);
    });
  });

  it("force le fallback quand demandé", () => {
    const result = generateRulePipeline("Une règle inconnue", {
      forceFallback: true,
    });
    expect(result.fallbackProvider).toBeDefined();
    expect(result.intentWarnings[0]?.code).toBe("no_match");
  });
});
