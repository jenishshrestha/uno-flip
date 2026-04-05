import type { ActiveSide, CardSide } from "@uno-flip/shared";

// Hex string colors for light side (solid colors)
export const LIGHT_COLORS: Record<string, string> = {
  red: "#D72600",
  blue: "#0956BF",
  green: "#379711",
  yellow: "#ECD407",
  wild: "#333333",
};

// Solid fallback colors for dark side
export const DARK_COLORS: Record<string, string> = {
  pink: "#EA2F86",
  teal: "#29AAE3",
  orange: "#F29D09",
  purple: "#880CB5",
  wild: "#333333",
};

// Gradient stops for dark side cards
export const DARK_GRADIENTS: Record<string, { start: string; end: string }> = {
  pink: { start: "#FF00FF", end: "#8A008A" },
  teal: { start: "#00FFFF", end: "#008080" },
  orange: { start: "#FF8C00", end: "#B05500" },
  purple: { start: "#BF00FF", end: "#5A0080" },
};

export function getCardColorHex(
  face: CardSide,
  activeSide: ActiveSide,
): string {
  const map = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;
  return map[face.color] ?? "#333333";
}

export function getDarkGradient(
  color: string,
): { start: string; end: string } | null {
  return DARK_GRADIENTS[color] ?? null;
}
