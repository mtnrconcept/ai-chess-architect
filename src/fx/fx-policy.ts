/**
 * Untrusted rule blueprints can describe appearances but cannot dictate
 * arbitrary coordinates, resource URLs, unbounded shaders or animation costs.
 */
const CELL = /^[a-h][1-8]$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;
const SUPPORTED_FX_INTENTS = new Set([
  "object.spawn",
  "area.hazard",
  "combat.explosion",
  "combat.hit",
  "combat.freeze",
  "combat.burn",
  "space.warp",
  "viz.hologram",
  "viz.scan",
  "viz.highlight",
  "piece.trail",
]);

export function normalizeFxCell(value: unknown): string | null {
  return typeof value === "string" && CELL.test(value) ? value : null;
}

export function resolveFxColor(value: unknown, fallback: number): number {
  if (typeof value !== "string" || !HEX_COLOR.test(value)) return fallback;
  return Number.parseInt(value.slice(1), 16);
}

export function sanitizeFxRadius(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(0.5, Math.min(3, value));
}

export function sanitizeFxDuration(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0.8;
  return Math.max(0.15, Math.min(2, value));
}

export function isSupportedFxIntent(intent: unknown): boolean {
  return typeof intent === "string" && SUPPORTED_FX_INTENTS.has(intent);
}
