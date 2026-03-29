import type { Card, CardValue, DarkColor, LightColor } from "../types/card.js";

// ─── Color pairings ───
// Each light color maps to a dark color on the flip side.
// When you flip a red card over, you see pink on the back.
const COLOR_PAIRS: [LightColor, DarkColor][] = [
  ["red", "pink"],
  ["yellow", "teal"],
  ["green", "orange"],
  ["blue", "purple"],
];

// ─── Action card pairings (light side → dark side) ───
const ACTION_PAIRS: [CardValue, CardValue][] = [
  ["skip", "skip"],
  ["reverse", "reverse"],
  ["draw_one", "draw_five"],
];

// ─── Build the full 112-card deck ───
function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;

  // For each color pair (red/pink, yellow/teal, green/orange, blue/purple)
  for (const [lightColor, darkColor] of COLOR_PAIRS) {
    // One 0 card per color
    cards.push({
      id: id++,
      light: { color: lightColor, value: 0 },
      dark: { color: darkColor, value: 0 },
    });

    // Two of each number 1-9
    for (let num = 1; num <= 9; num++) {
      const value = num as CardValue;
      cards.push({
        id: id++,
        light: { color: lightColor, value },
        dark: { color: darkColor, value },
      });
      cards.push({
        id: id++,
        light: { color: lightColor, value },
        dark: { color: darkColor, value },
      });
    }

    // Two of each action card (skip, reverse, draw)
    for (const [lightAction, darkAction] of ACTION_PAIRS) {
      cards.push({
        id: id++,
        light: { color: lightColor, value: lightAction },
        dark: { color: darkColor, value: darkAction },
      });
      cards.push({
        id: id++,
        light: { color: lightColor, value: lightAction },
        dark: { color: darkColor, value: darkAction },
      });
    }

    // One Flip card per color
    cards.push({
      id: id++,
      light: { color: lightColor, value: "flip" },
      dark: { color: darkColor, value: "flip" },
    });
  }

  // 4 Wild cards (no color — you pick when you play it)
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: id++,
      light: { color: "wild", value: "wild" },
      dark: { color: "wild", value: "wild" },
    });
  }

  // 4 Wild Draw cards
  // Light side: Wild Draw Two (next player draws 2)
  // Dark side: Wild Draw Color (next player draws until they get the chosen color!)
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: id++,
      light: { color: "wild", value: "wild_draw_two" },
      dark: { color: "wild", value: "wild_draw_color" },
    });
  }

  return cards;
}

// ─── The complete deck — exported for use everywhere ───
export const FULL_DECK: readonly Card[] = buildDeck();

// Quick sanity check: should always be 112
// 4 colors × 26 cards + 8 wilds = 112
if (FULL_DECK.length !== 112) {
  throw new Error(`Deck should have 112 cards, but has ${FULL_DECK.length}`);
}
