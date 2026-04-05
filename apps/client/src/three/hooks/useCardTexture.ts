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

// ─── Main hook ───
export function useCardFaceTexture(
  face: CardSide,
  activeSide: ActiveSide,
): CanvasTexture {
  return useMemo(() => {
    const color = getCardColorHex(face, activeSide);
    const value = formatValue(face.value);
    const gradient = activeSide === "dark" ? getDarkGradient(face.color) : null;
    const svg = buildCardSvg(color, value, activeSide, gradient);
    return svgToTexture(svg);
  }, [face, activeSide]);
}

// ─── Card back texture ───
let cachedBackTexture: CanvasTexture | null = null;

export function useCardBackTexture(): CanvasTexture {
  return useMemo(() => {
    if (cachedBackTexture) return cachedBackTexture;

    const w = CARD_TEX_WIDTH;
    const h = CARD_TEX_HEIGHT;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    // biome-ignore lint/style/noNonNullAssertion: 2d context always exists
    const ctx = canvas.getContext("2d")!;

    const border = (5 / 60) * w;
    const outerR = (10 / 60) * w;
    const innerR = (5 / 60) * w;

    ctx.clearRect(0, 0, w, h);

    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, outerR);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
    ctx.strokeStyle = "rgba(0, 0, 0, 0.2)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.beginPath();
    ctx.roundRect(border, border, w - border * 2, h - border * 2, innerR);
    ctx.fillStyle = "#1a1a2e";
    ctx.fill();

    ctx.beginPath();
    ctx.ellipse(w / 2, h / 2, w * 0.3, h * 0.22, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#c0392b";
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${w * 0.22}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("UNO", w / 2, h / 2 - 2);

    ctx.font = `bold ${w * 0.1}px system-ui, sans-serif`;
    ctx.fillStyle = "rgba(255, 255, 255, 0.5)";
    ctx.fillText("FLIP", w / 2, h / 2 + w * 0.16);

    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    cachedBackTexture = texture;
    return texture;
  }, []);
}
