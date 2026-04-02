import type { ActiveSide, Card, CardSide } from "@uno-flip/shared";
import { motion } from "motion/react";
import { DARK_COLORS, LIGHT_COLORS } from "../styles.js";

function getCardColor(face: CardSide, activeSide: ActiveSide): string {
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;
  return colorMap[face.color] ?? "#333";
}

function formatValue(value: CardSide["value"]): string {
  if (typeof value === "number") return String(value);
  const labels: Record<string, string> = {
    skip: "⊘",
    skip_everyone: "⊘ALL",
    reverse: "⇄",
    draw_one: "+1",
    draw_five: "+5",
    flip: "FLIP",
    wild: "W",
    wild_draw_two: "W+2",
    wild_draw_color: "W+C",
  };
  return labels[value] ?? value;
}

// ─── Full 3D card with front and back ───
export function UnoCard({
  card,
  activeSide,
  faceUp = true,
  playable = false,
  onClick,
  size = "normal",
}: {
  card: Card;
  activeSide: ActiveSide;
  faceUp?: boolean;
  playable?: boolean;
  onClick?: () => void;
  size?: "normal" | "mini";
}) {
  const face = activeSide === "light" ? card.light : card.dark;
  const bg = getCardColor(face, activeSide);
  const isMini = size === "mini";
  const w = isMini ? 28 : 56;
  const h = isMini ? 40 : 84;

  return (
    <div className="card-3d" style={{ width: w, height: h }}>
      <motion.div
        className="card-3d-inner"
        animate={{ rotateY: faceUp ? 0 : 180 }}
        transition={{ duration: 0.5, ease: "easeInOut" }}
        onClick={onClick}
        style={{ cursor: onClick ? "pointer" : "default" }}
      >
        {/* Front face */}
        <div
          className="card-3d-face card-3d-front"
          style={{
            backgroundColor: bg,
            border: playable
              ? "2.5px solid #FFD700"
              : "2px solid rgba(255,255,255,0.2)",
            boxShadow: playable
              ? "0 4px 15px rgba(255,215,0,0.3)"
              : "0 2px 6px rgba(0,0,0,0.3)",
            fontSize: isMini ? 9 : 15,
          }}
        >
          {formatValue(face.value)}
        </div>

        {/* Back face */}
        <div className="card-3d-face card-3d-back" />
      </motion.div>
    </div>
  );
}

// ─── Face-down card back (for opponents) ───
export function CardBack({ count }: { count: number }) {
  // Show up to 10 mini card backs, stacked with overlap
  const shown = Math.min(count, 10);
  return (
    <div className="opponent-cards">
      {Array.from({ length: shown }).map((_, i) => (
        <div
          // biome-ignore lint: index key is fine for static display
          key={i}
          className="card-mini"
        />
      ))}
    </div>
  );
}
