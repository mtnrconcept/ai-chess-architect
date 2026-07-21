import { assertEquals } from "jsr:@std/assert@1";
import { normalizeRuleBlueprintCandidate } from "./rule-blueprint-normalizer.ts";

Deno.test("normalizer repairs empty examples without touching logic", () => {
  const candidate = {
    title: "Sables mouvants",
    summary: "Les pions déposent un piège sur une case.",
    tags: ["trap"],
    balance: {
      powerLevel: 3,
      counterplay: ["Éviter la case."],
      limitations: ["Une fois par pion."],
    },
    explanation: {
      plainLanguage: "Le pion crée un piège temporaire sur une case valide.",
      examples: [],
    },
    actions: [{ id: "place-trap" }],
    triggers: [{ id: "place", effects: [{ op: "tile.setTrap" }] }],
  };

  const result = normalizeRuleBlueprintCandidate(
    candidate,
    "Les pions déposent des sables mouvants.",
  );
  const value = result.value as typeof candidate;

  assertEquals(value.actions, candidate.actions);
  assertEquals(value.triggers, candidate.triggers);
  assertEquals(value.explanation.examples.length, 2);
  assertEquals(result.normalizedFields, ["$.explanation.examples"]);
});

Deno.test("normalizer creates descriptive blocks but never game operations", () => {
  const result = normalizeRuleBlueprintCandidate(
    {
      title: "",
      summary: "",
      tags: "invalid",
      explanation: {},
      balance: {},
      actions: [],
      triggers: [],
    },
    "Une tour laisse un piège après une capture.",
  );
  const value = result.value as Record<string, unknown>;

  assertEquals(value.actions, []);
  assertEquals(value.triggers, []);
  assertEquals(Array.isArray(value.tags), true);
  assertEquals(
    Array.isArray((value.explanation as { examples: unknown }).examples),
    true,
  );
});
