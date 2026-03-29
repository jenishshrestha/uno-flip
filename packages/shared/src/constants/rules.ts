import type { CardValue } from "../types/card.js";

export const GAME_RULES = {
  MIN_PLAYERS: 2,
  MAX_PLAYERS: 10,
  CARDS_PER_PLAYER: 7,
  WIN_SCORE: 500,
  ROOM_CODE_LENGTH: 4,
  CHALLENGE_PENALTY_EXTRA: 2, // extra cards drawn when a challenge fails
} as const;

// Point values for scoring (based on whichever side the game ended on)
export const CARD_POINTS: Record<CardValue, number> = {
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
  skip_everyone: 30,
  reverse: 20,
  draw_one: 10,
  draw_five: 20,
  flip: 20,
  wild: 40,
  wild_draw_two: 50,
  wild_draw_color: 60,
};
