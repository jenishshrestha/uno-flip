import type { ActiveSide, CardSide } from "@uno-flip/shared";
import { useMemo } from "react";
import { CanvasTexture, SRGBColorSpace } from "three";
import { getCardColorHex, getDarkGradient } from "../utils/cardColors.js";
import { buildCardSvg } from "../utils/cardSvgTemplate.js";
import { CARD_TEX_HEIGHT, CARD_TEX_WIDTH } from "../utils/constants.js";

// ─── Render SVG string to a CanvasTexture (synchronous via data URL) ───
function svgToTexture(svgString: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = CARD_TEX_WIDTH;
  canvas.height = CARD_TEX_HEIGHT;
  // biome-ignore lint/style/noNonNullAssertion: 2d context always exists
  const ctx = canvas.getContext("2d")!;

  const img = new Image();
  const blob = new Blob([svgString], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);

  // Draw synchronously won't work — need to wait for load
  // Use a placeholder texture, update when image loads
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;

  img.onload = () => {
    ctx.drawImage(img, 0, 0, CARD_TEX_WIDTH, CARD_TEX_HEIGHT);
    URL.revokeObjectURL(url);
    texture.needsUpdate = true;
  };
  img.src = url;

  return texture;
}

function formatValue(value: CardSide["value"]): string {
  if (typeof value === "number") return String(value);
  return value;
}

// Module-level cache so every Card3D instance sharing the same (color, value,
// activeSide) reuses the same CanvasTexture. Prevents the blank-frame blink
// when a card transfers from a throw animation into the discard pile.
const faceTextureCache = new Map<string, CanvasTexture>();

function getOrCreateFaceTexture(
  face: CardSide,
  activeSide: ActiveSide,
  chosenColorHex?: string,
): CanvasTexture {
  const value = formatValue(face.value);
  const key = `${face.color}|${value}|${activeSide}|${chosenColorHex ?? ""}`;
  const cached = faceTextureCache.get(key);
  if (cached) return cached;

  const color = getCardColorHex(face, activeSide);
  const gradient = activeSide === "dark" ? getDarkGradient(face.color) : null;
  const svg = buildCardSvg(color, value, activeSide, gradient, chosenColorHex);
  const texture = svgToTexture(svg);
  faceTextureCache.set(key, texture);
  return texture;
}

// ─── Main hook ───
// `chosenColorHex` only applies to wild cards on the discard pile (recolors
// the 4-color diamond to a single tint). Folded into the cache key.
export function useCardFaceTexture(
  face: CardSide,
  activeSide: ActiveSide,
  chosenColorHex?: string,
): CanvasTexture {
  return useMemo(
    () => getOrCreateFaceTexture(face, activeSide, chosenColorHex),
    [face, activeSide, chosenColorHex],
  );
}
