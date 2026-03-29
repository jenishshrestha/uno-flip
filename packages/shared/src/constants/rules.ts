import type { CardValue } from "../types/card.js";

// ─── Game rules ───
export const GAME_RULES = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  CARDS_PER_PLAYER: 7, // each player starts with 7 cards
  WIN_SCORE: 500, // first to 500 points wins the whole game
  ROOM_CODE_LENGTH: 4, // e.g. "ABCD"
} as const;

// ─── Point values for scoring ───
// When someone wins a round, they score points based on
// what's left in OTHER players' hands.
// Think of it like: the worse the cards stuck in your hand, the more points the winner gets.
export const CARD_POINTS: Record<CardValue, number> = {
  0: 0,
  1: 1,
  2: 2,
  3: 3,
  4: 4,
  5: 5,
  6: 6,
  7: 7,
  8: 8,
  9: 9,
  skip: 20,
  reverse: 20,
  draw_one: 10,
  draw_five: 20,
  flip: 20,
  wild: 40,
  wild_draw_two: 50,
  wild_draw_color: 60, // most punishing card to be stuck with
};
