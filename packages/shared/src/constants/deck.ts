import type { Card, CardSide, CardValue } from "../types/card.js";

// ─── Official UNO Flip deck with exact light/dark pairings ───
// From physical card list (CARDS_LIST.md)
// Each entry: [light side, dark side]

type RawCard = [string, string];

const RAW_DECK: RawCard[] = [
  // Wild cards (light side black bg)
  ["wild draw 2", "orange 4"],
  ["wild draw 2", "orange 7"],
  ["wild draw 2", "pink 2"],
  ["wild draw 2", "purple 9"],
  ["wild", "pink 5"],
  ["wild", "pink flip"],
  ["wild", "purple 7"],
  ["wild", "teal 3"],
  // Blue
  ["blue 1", "purple skip everyone"],
  ["blue 1", "purple skip everyone"],
  ["blue 2", "orange 8"],
  ["blue 2", "pink 6"],
  ["blue 3", "purple 8"],
  ["blue 3", "teal 2"],
  ["blue 4", "purple 1"],
  ["blue 4", "teal draw 5"],
  ["blue 5", "orange reverse"],
  ["blue 5", "pink 9"],
  ["blue 6", "purple reverse"],
  ["blue 6", "teal skip everyone"],
  ["blue 7", "orange 3"],
  ["blue 7", "orange skip everyone"],
  ["blue 8", "teal 4"],
  ["blue 8", "teal reverse"],
  ["blue 9", "orange 5"],
  ["blue 9", "purple flip"],
  ["blue draw 1", "pink 6"],
  ["blue draw 1", "teal 6"],
  ["blue flip", "purple 6"],
  ["blue flip", "purple 7"],
  ["blue reverse", "orange 4"],
  ["blue reverse", "wild"],
  ["blue skip", "pink 9"],
  ["blue skip", "teal 1"],
  // Green
  ["green 1", "orange 5"],
  ["green 1", "orange flip"],
  ["green 2", "teal draw 5"],
  ["green 2", "teal skip everyone"],
  ["green 3", "pink flip"],
  ["green 3", "purple 2"],
  ["green 4", "pink 8"],
  ["green 4", "teal 9"],
  ["green 5", "orange 7"],
  ["green 5", "teal 4"],
  ["green 6", "pink 5"],
  ["green 6", "wild draw color"],
  ["green 7", "orange 6"],
  ["green 7", "teal 2"],
  ["green 8", "pink reverse"],
  ["green 8", "teal 9"],
  ["green 9", "orange draw 5"],
  ["green 9", "pink reverse"],
  ["green draw 1", "orange 6"],
  ["green draw 1", "teal 6"],
  ["green flip", "teal 3"],
  ["green flip", "wild draw color"],
  ["green reverse", "orange 1"],
  ["green reverse", "pink 7"],
  ["green skip", "orange 9"],
  ["green skip", "purple 4"],
  // Red
  ["red 1", "pink 3"],
  ["red 1", "purple 2"],
  ["red 2", "orange reverse"],
  ["red 2", "purple draw 5"],
  ["red 3", "pink 7"],
  ["red 3", "wild draw color"],
  ["red 4", "orange flip"],
  ["red 4", "purple draw 5"],
  ["red 5", "pink 2"],
  ["red 5", "teal 5"],
  ["red 6", "orange 9"],
  ["red 6", "pink skip everyone"],
  ["red 7", "orange 1"],
  ["red 7", "purple 5"],
  ["red 8", "purple reverse"],
  ["red 8", "teal 7"],
  ["red 9", "purple 5"],
  ["red 9", "teal reverse"],
  ["red draw 1", "pink 3"],
  ["red draw 1", "pink 4"],
  ["red flip", "pink 8"],
  ["red flip", "purple 3"],
  ["red reverse", "purple 3"],
  ["red reverse", "teal 7"],
  ["red skip", "orange draw 5"],
  ["red skip", "wild"],
  // Yellow
  ["yellow 1", "pink skip everyone"],
  ["yellow 1", "wild"],
  ["yellow 2", "teal 1"],
  ["yellow 2", "teal 8"],
  ["yellow 3", "pink draw 5"],
  ["yellow 3", "purple 1"],
  ["yellow 4", "pink draw 5"],
  ["yellow 4", "purple flip"],
  ["yellow 5", "purple 9"],
  ["yellow 5", "teal 8"],
  ["yellow 6", "orange skip everyone"],
  ["yellow 6", "wild draw color"],
  ["yellow 7", "orange 2"],
  ["yellow 7", "purple 6"],
  ["yellow 8", "orange 2"],
  ["yellow 8", "pink 1"],
  ["yellow 9", "purple 4"],
  ["yellow 9", "teal 5"],
  ["yellow draw 1", "pink 1"],
  ["yellow draw 1", "purple 8"],
  ["yellow flip", "orange 8"],
  ["yellow flip", "pink 4"],
  ["yellow reverse", "teal flip"],
  ["yellow reverse", "wild"],
  ["yellow skip", "orange 3"],
  ["yellow skip", "teal flip"],
];

// ─── Parse a card description like "blue 3" or "wild draw 2" into a CardSide ───
function parseCardSide(desc: string): CardSide {
  const d = desc.trim().toLowerCase();

  // Wild variants
  if (d === "wild") return { color: "wild", value: "wild" };
  if (d === "wild draw 2") return { color: "wild", value: "wild_draw_two" };
  if (d === "wild draw color")
    return { color: "wild", value: "wild_draw_color" };

  // Colored cards: "color value"
  const parts = d.split(" ");
  const color = parts[0] as CardSide["color"];
  const rest = parts.slice(1).join(" ");

  let value: CardValue;
  const num = Number.parseInt(rest, 10);
  if (!Number.isNaN(num) && num >= 1 && num <= 9) {
    value = num as CardValue;
  } else {
    const valueMap: Record<string, CardValue> = {
      skip: "skip",
      "skip everyone": "skip_everyone",
      reverse: "reverse",
      "draw 1": "draw_one",
      "draw 5": "draw_five",
      flip: "flip",
    };
    const mapped = valueMap[rest];
    if (!mapped) {
      throw new Error(`Unknown card value: "${rest}" in "${desc}"`);
    }
    value = mapped;
  }

  return { color, value };
}

// ─── Build the deck from exact pairings ───
function buildDeck(): Card[] {
  return RAW_DECK.map(([lightDesc, darkDesc], id) => ({
    id,
    light: parseCardSide(lightDesc),
    dark: parseCardSide(darkDesc),
  }));
}

export const FULL_DECK: readonly Card[] = buildDeck();

// O(1) card lookup by ID
export const DECK_MAP: ReadonlyMap<number, Card> = new Map(
  FULL_DECK.map((card) => [card.id, card]),
);

// Sanity check
if (FULL_DECK.length !== 112) {
  throw new Error(`Deck should have 112 cards, but has ${FULL_DECK.length}`);
}
