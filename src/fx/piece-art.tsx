import { useId } from "react";
import type { ChessPiece } from "@/types/chess";

/**
 * A fully offline visual-generator for rule-themed chess pieces.
 * It does not fetch model-generated images or allow executable user SVG.
 * Prompt words select a bounded material preset rendered with SVG geometry.
 */
export const PIECE_MATERIALS = ["sand", "ice", "flame", "forest", "shadow", "arcane", "steel"] as const;
export type PieceMaterial = (typeof PIECE_MATERIALS)[number];

const MATERIAL_WORDS: ReadonlyArray<[PieceMaterial, RegExp]> = [
  ["sand", /sables? mouvants?|quicksand|desert|désert|dunes?|sandstorm|ensabl/i],
  ["ice", /glac|givr|freez|ice|frost|neige|hiver|gelé/i],
  ["flame", /feu|flammes?|incendi|lava|magma|braise|fire|burn|pho[eé]nix/i],
  ["forest", /forêt|forest|nature|liane|plante|arbre|végétal|feuill|vigne/i],
  ["shadow", /ombre|shadow|fant[oô]me|spectr|invisible|furtif|nuit|void/i],
  ["arcane", /magie|magical|sorc|rune|arcane|foudre|éclair|lightning|quantum/i],
  ["steel", /acier|armure|robot|métal|mechan|steampunk|steel/i],
];

export function inferPieceMaterial(prompt: string | null | undefined): PieceMaterial | null {
  const normalized = (prompt ?? "").slice(0, 4000).normalize("NFC");
  return MATERIAL_WORDS.find(([, pattern]) => pattern.test(normalized))?.[0] ?? null;
}

const themeColors: Record<PieceMaterial, readonly [string, string, string]> = {
  sand: ["#f5d184", "#b98238", "#75401f"],
  ice: ["#e3faff", "#6fd9ed", "#287ea5"],
  flame: ["#ffd47b", "#f77c38", "#9a2430"],
  forest: ["#c3f9a9", "#559e67", "#225b43"],
  shadow: ["#bdabf1", "#7151b3", "#282246"],
  arcane: ["#f7c2ff", "#8f75eb", "#452c92"],
  steel: ["#e7eef7", "#8ea5bc", "#42566c"],
};

const symbol: Record<ChessPiece["type"], { white: string; black: string }> = {
  king: { white: "♔", black: "♚" },
  queen: { white: "♕", black: "♛" },
  rook: { white: "♖", black: "♜" },
  bishop: { white: "♗", black: "♝" },
  knight: { white: "♘", black: "♞" },
  pawn: { white: "♙", black: "♟" },
};

export function ProceduralPieceArt({
  type,
  color,
  material,
}: {
  type: ChessPiece["type"];
  color: ChessPiece["color"];
  material: PieceMaterial;
}) {
  const rawId = useId().replace(/:/g, "-");
  const gradient = `piece-material-${rawId}`;
  const [light, mid, dark] = themeColors[material];
  const white = color === "white";
  return (
    <svg
      viewBox="0 0 100 100"
      className="relative z-[1] h-[clamp(2rem,7vw,3.8rem)] w-[clamp(2rem,7vw,3.8rem)] max-w-full max-h-full"
      role="img"
      aria-label={`${type} ${white ? "blanc" : "noir"} en style ${material}`}
      focusable="false"
    >
      <defs>
        <radialGradient id={gradient} cx="35%" cy="25%" r="85%">
          <stop offset="0%" stopColor={light} stopOpacity="0.86" />
          <stop offset="64%" stopColor={mid} stopOpacity="0.69" />
          <stop offset="100%" stopColor={dark} stopOpacity="0.92" />
        </radialGradient>
      </defs>
      <ellipse cx="50" cy="81" rx="27" ry="7" fill="#081320" opacity="0.3" />
      <circle cx="50" cy="48" r="39" fill={`url(#${gradient})`} stroke={light} strokeWidth="2.2" />
      <circle cx="50" cy="48" r="33" fill="none" stroke={dark} strokeWidth="1.4" opacity="0.5" />
      {material === "sand" && (
        <g fill="none" stroke={light} strokeWidth="2" opacity="0.86">
          <path d="M18 54 Q34 38 46 54 T81 52" />
          <path d="M18 64 Q36 48 49 65 T80 63" />
          <circle cx="75" cy="32" r="2" fill={light} />
          <circle cx="25" cy="34" r="1.5" fill={light} />
        </g>
      )}
      {material === "ice" && (
        <g fill="none" stroke={light} strokeWidth="2.2">
          <path d="M18 48 L35 28 L49 45 L65 22 L81 48" />
          <path d="M19 66 L36 52 L49 65 L65 49 L81 68" />
        </g>
      )}
      {material === "flame" && (
        <g fill={light} opacity="0.83">
          <path d="M20 63 Q13 47 24 36 Q25 48 34 45 Q29 26 40 20 Q36 45 49 43 Q45 19 59 23 Q52 45 71 41 Q77 34 73 27 Q93 48 81 66Z" />
        </g>
      )}
      {material === "forest" && (
        <g fill="none" stroke={light} strokeWidth="2.4">
          <path d="M21 64 Q20 29 47 26 Q62 25 78 41" />
          <path d="M30 31 Q38 33 37 43 Q26 44 30 31M70 53 Q77 43 82 49 Q83 62 70 53" />
        </g>
      )}
      {material === "shadow" && (
        <g fill="none" stroke={light} strokeWidth="1.8" strokeDasharray="4 5">
          <circle cx="50" cy="48" r="29" />
          <path d="M21 48 L79 48 M50 20 L50 76" />
        </g>
      )}
      {material === "arcane" && (
        <g fill="none" stroke={light} strokeWidth="1.8">
          <path d="M50 14 L79 65 L21 65Z M50 78 L21 30 L79 30Z" />
          <circle cx="50" cy="47" r="22" />
        </g>
      )}
      {material === "steel" && (
        <g fill="none" stroke={light} strokeWidth="2">
          <path d="M19 35 L34 20 L66 20 L81 35 L81 63 L66 77 L34 77 L19 63Z" />
          <circle cx="50" cy="49" r="28" strokeDasharray="5 4" />
        </g>
      )}
      <text
        x="50"
        y="70"
        textAnchor="middle"
        fontSize="62"
        fontFamily="'Segoe UI Symbol', 'DejaVu Sans', serif"
        stroke={white ? "#182133" : "#e3e9ee"}
        strokeWidth="3.8"
        paintOrder="stroke"
        fill={white ? "#f8fafc" : "#151a25"}
      >
        {symbol[type][color]}
      </text>
      <circle cx="31" cy="25" r="4" fill={light} opacity="0.85" />
    </svg>
  );
}
