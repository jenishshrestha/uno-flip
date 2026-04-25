import type { ActiveSide, DarkColor, LightColor } from "@uno-flip/shared";
import { AnimatePresence, motion } from "motion/react";
import { DARK_COLORS, LIGHT_COLORS } from "../utils/cardColors.js";

// 4 quadrant paths lifted directly from WILD_SVG (cardSvgTemplate.ts).
// Together they form the oval at the center of every wild card.
// Coordinate space: 242 × 362.
const QUADRANTS = {
  topLeft: "M181 81C113.871 81 56.4976 122.389 32.75 181H121L181 81Z",
  topRight:
    "M181 81L121 181H209.25C216.763 162.458 221 142.237 221 121C221 98.9086 203.091 81 181 81Z",
  bottomLeft:
    "M32.75 181C25.2373 199.542 21 219.763 21 241C21 263.091 38.9086 281 61 281L121 181H32.75Z",
  bottomRight: "M121 181L61 281C128.129 281 185.502 239.611 209.25 181H121Z",
} as const;

// White outline of the oval so the picker has the same crisp ring as the
// real wild card.
const OVAL_OUTLINE =
  "M181 81C113.871 81 56.4976 122.389 32.75 181C25.2373 199.542 21 219.763 21 241C21 263.091 38.9086 281 61 281C128.129 281 185.502 239.611 209.25 181C216.763 162.458 221 142.237 221 121C221 98.9086 203.091 81 181 81Z";

// Approximate centroid of each quadrant — used as the transform-origin
// when scaling on hover so the wedge zooms in place rather than drifting.
const CENTROIDS = {
  topLeft: { x: 90, y: 135 },
  topRight: { x: 165, y: 135 },
  bottomLeft: { x: 75, y: 230 },
  bottomRight: { x: 165, y: 230 },
} as const;

type QuadrantKey = keyof typeof QUADRANTS;

// Position → color, per side. Light matches the wild card exactly.
const LIGHT_LAYOUT: Record<QuadrantKey, LightColor> = {
  topLeft: "red",
  topRight: "blue",
  bottomLeft: "yellow",
  bottomRight: "green",
};
const DARK_LAYOUT: Record<QuadrantKey, DarkColor> = {
  topLeft: "pink",
  topRight: "teal",
  bottomLeft: "orange",
  bottomRight: "purple",
};

const SVG_WIDTH = 320;
const SVG_HEIGHT = 480;
const QUADRANT_KEYS: QuadrantKey[] = [
  "topLeft",
  "topRight",
  "bottomLeft",
  "bottomRight",
];

export function ColorPickerOverlay({
  show,
  activeSide,
  onSelect,
}: {
  show: boolean;
  activeSide: ActiveSide;
  onSelect: (color: LightColor | DarkColor) => void;
}) {
  const layout = activeSide === "light" ? LIGHT_LAYOUT : DARK_LAYOUT;
  const colorMap = activeSide === "light" ? LIGHT_COLORS : DARK_COLORS;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          key="color-picker"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.85)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 100,
            fontFamily: "system-ui",
          }}
        >
          <motion.p
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.1 }}
            style={{
              color: "white",
              fontSize: 22,
              marginBottom: 28,
              letterSpacing: 1,
            }}
          >
            Pick a color
          </motion.p>

          <motion.svg
            width={SVG_WIDTH}
            height={SVG_HEIGHT}
            viewBox="0 0 242 362"
            initial={{ scale: 0, rotate: -10 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", bounce: 0.45, delay: 0.1 }}
            aria-label="Pick a color"
          >
            <title>Pick a color</title>
            {QUADRANT_KEYS.map((key) => {
              const color = layout[key];
              const centroid = CENTROIDS[key];
              return (
                <motion.path
                  key={key}
                  d={QUADRANTS[key]}
                  fill={colorMap[color]}
                  style={{
                    cursor: "pointer",
                    transformBox: "fill-box",
                    transformOrigin: `${centroid.x}px ${centroid.y}px`,
                  }}
                  whileHover={{
                    scale: 1.12,
                    filter: "brightness(1.15)",
                  }}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  onClick={() => onSelect(color)}
                />
              );
            })}
            {/* Outline ring on top so hover-scaled quadrants don't poke past it */}
            <path
              d={OVAL_OUTLINE}
              fill="none"
              stroke="#fff"
              strokeWidth="6"
              pointerEvents="none"
            />
          </motion.svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
