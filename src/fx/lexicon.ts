import type { FxIntent } from "./types";

export type FxLexiconEntry = {
  kw: string[];
  intents: FxIntent[];
};

export const FxLexicon: FxLexiconEntry[] = [
  {
    kw: ["mine", "piège", "trap"],
    intents: [
      { intent: "object.spawn", kind: "mine", style: { holo: true, glow: "#76E0FF", blink: true } },
      { intent: "area.hazard", kind: "mine-radius", radius: 1, style: { ring: true, pulse: true } },
      { intent: "combat.explosion", power: "medium", style: { sparks: true, smoke: "light", color: "#FF6A00" } },
    ],
  },
  {
    kw: ["teleport", "téléport", "blink", "portal"],
    intents: [{ intent: "space.warp", mode: "blink", style: { color: "#76E0FF" } }],
  },
  {
    kw: ["scan", "hologram", "projection"],
    intents: [{ intent: "viz.hologram", style: { color: "#00F1FF", holo: true } }],
  },
  {
    kw: ["flamme", "burn", "fire"],
    intents: [{ intent: "combat.burn", power: "medium", style: { color: "#FF4500", smoke: "light" } }],
  },
  {
    kw: ["gel", "freeze", "ice"],
    intents: [{ intent: "combat.freeze", power: "small", style: { color: "#76E0FF" } }],
  },
  {
    kw: ["charge", "rush", "dash"],
    intents: [{ intent: "piece.trail", color: "#FFD166", duration: 0.6 }],
  },
  {
    kw: ["secret", "setup", "disposition", "aveugle", "caché"],
    intents: [{ intent: "viz.hologram", style: { color: "#9C27B0", holo: true } }],
  },
  {
    kw: ["catapult", "lance", "projete", "propulse"],
    intents: [
      { intent: "piece.trail", color: "#FF5722", duration: 0.8 },
      { intent: "combat.hit", power: "medium" }
    ],
  },
  {
    kw: ["invisible", "furtif", "stealth"],
    intents: [{ intent: "viz.hologram", style: { color: "#76E0FF", holo: true, blink: true } }],
  },
  {
    kw: ["bouclier", "shield", "protection"],
    intents: [{ intent: "viz.highlight", style: { color: "#4CAF50", ring: true, pulse: true } }],
  },
];

export function lookupFxIntents(description: string): FxIntent[] {
  const lower = description.toLowerCase();
  const acc: FxIntent[] = [];
  for (const entry of FxLexicon) {
    if (entry.kw.some((kw) => lower.includes(kw))) {
      acc.push(...entry.intents);
    }
  }
  return acc;
}
