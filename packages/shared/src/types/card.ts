// ─── Light side colors (the "normal" UNO colors) ───
export type LightColor = "red" | "yellow" | "green" | "blue";

// ─── Dark side colors (used when the deck is flipped) ───
export type DarkColor = "orange" | "pink" | "purple" | "teal";

// ─── Values that can appear on a card ───
// Numbers: 1-9 only (no 0 in UNO Flip)
export type CardValue =
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | "skip" // light side: skip next player
  | "skip_everyone" // dark side: skip ALL other players, you go again
  | "reverse"
  | "draw_one" // light side: next player draws 1
  | "draw_five" // dark side: next player draws 5
  | "flip"
  | "wild"
  | "wild_draw_two" // light side: pick color + next draws 2 (challengeable)
  | "wild_draw_color"; // dark side: pick color + next draws until that color (challengeable)

// ─── Which side of the deck is currently active ───
export type ActiveSide = "light" | "dark";

// ─── One side of a card ───
export interface CardSide {
  color: LightColor | DarkColor | "wild";
  value: CardValue;
}

// ─── A complete card (has both sides) ───
export interface Card {
  id: number;
  light: CardSide;
  dark: CardSide;
}
