import type { Card, CardValue, DarkColor, LightColor } from "../types/card.js";

// ─── Official UNO Flip color pairings (light ↔ dark on same physical card) ───
const COLOR_PAIRS: [LightColor, DarkColor][] = [
  ["red", "orange"],
  ["blue", "teal"],
  ["yellow", "pink"],
  ["green", "purple"],
];

// ─── Action card pairings (light side → dark side equivalent) ───
const ACTION_PAIRS: [CardValue, CardValue][] = [
  ["skip", "skip_everyone"], // light Skip → dark Skip Everyone
  ["reverse", "reverse"],
  ["draw_one", "draw_five"], // light Draw One → dark Draw Five
];

// ─── Build the full 112-card deck ───
// Per color (×4): 18 numbers (1-9 × 2) + 6 actions (3 types × 2) + 2 flip = 26
// 26 × 4 = 104 colored cards + 4 Wild + 4 Wild Draw = 112 total
function buildDeck(): Card[] {
  const cards: Card[] = [];
  let id = 0;

  for (const [lightColor, darkColor] of COLOR_PAIRS) {
    // Two of each number 1-9 (no 0 in UNO Flip)
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

    // Two of each action card (skip/skip_everyone, reverse, draw_one/draw_five)
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

    // Two Flip cards per color
    cards.push({
      id: id++,
      light: { color: lightColor, value: "flip" },
      dark: { color: darkColor, value: "flip" },
    });
    cards.push({
      id: id++,
      light: { color: lightColor, value: "flip" },
      dark: { color: darkColor, value: "flip" },
    });
  }

  // 4 Wild cards
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: id++,
      light: { color: "wild", value: "wild" },
      dark: { color: "wild", value: "wild" },
    });
  }

  // 4 Wild Draw cards (light: Wild Draw Two, dark: Wild Draw Color)
  for (let i = 0; i < 4; i++) {
    cards.push({
      id: id++,
      light: { color: "wild", value: "wild_draw_two" },
      dark: { color: "wild", value: "wild_draw_color" },
    });
  }

  return cards;
}

export const FULL_DECK: readonly Card[] = buildDeck();

// Sanity check: 4 colors × 26 cards + 8 wilds = 112
if (FULL_DECK.length !== 112) {
  throw new Error(`Deck should have 112 cards, but has ${FULL_DECK.length}`);
}
