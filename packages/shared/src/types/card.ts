// ─── Light side colors (the "normal" UNO colors) ───
export type LightColor = "red" | "yellow" | "green" | "blue";

// ─── Dark side colors (used when the deck is flipped) ───
export type DarkColor = "pink" | "teal" | "orange" | "purple";

// ─── Values that can appear on a card ───
// Numbers: 1-9 (and one 0 per color)
// Actions: skip, reverse, draw (light=draw1, dark=draw5)
// Wild: wild (pick color), wild_draw (light=draw2, dark=draw_color)
// Flip: flips the entire game to the other side
export type CardValue =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | "skip"
  | "reverse"
  | "draw_one" // light side: next player draws 1
  | "draw_five" // dark side: next player draws 5
  | "flip"
  | "wild"
  | "wild_draw_two" // light side: pick color + next draws 2
  | "wild_draw_color"; // dark side: pick color + next draws until they get that color

// ─── Which side of the deck is currently active ───
export type ActiveSide = "light" | "dark";

// ─── One side of a card ───
export interface CardSide {
  color: LightColor | DarkColor | "wild"; // "wild" = no color (wild cards)
  value: CardValue;
}

// ─── A complete card (has both sides) ───
export interface Card {
  id: number; // unique identifier (0-111, since there are 112 cards)
  light: CardSide; // what you see on the light side
  dark: CardSide; // what you see on the dark side
}
