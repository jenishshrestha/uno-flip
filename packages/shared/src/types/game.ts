import type { ActiveSide, CardSide } from "./card.js";

// ─── Game phases (state machine) ───
export type GamePhase =
  | "lobby"
  | "dealing"
  | "playing"
  | "choosing_color"
  | "round_over"
  | "game_over";

// ─── Direction of play ───
export type Direction = "clockwise" | "counter_clockwise";

// ─── Public info about a player (visible to everyone) ───
export interface PublicPlayer {
  id: string;
  name: string;
  cardCount: number;
  cardIds: number[]; // card IDs from FULL_DECK — everyone can see (inactive side visible in physical game)
  isUno: boolean;
  connected: boolean;
}

// ─── What everyone can see about the current game ───
export interface GameState {
  phase: GamePhase;
  activeSide: ActiveSide;
  discardTop: CardSide | null;
  currentPlayerIndex: number;
  direction: Direction;
  players: PublicPlayer[];
  // Server's shuffled draw pile, card IDs in server-internal order: index 0
  // is the bottom of the pile, the last element is the top (next to be drawn).
  // Sent authoritatively on every broadcast so every client sees the same
  // physical stack. In UNO Flip both sides of every card are visible anyway,
  // so sharing the order isn't a real information leak.
  drawPileCardIds: number[];
  hostId: string;
  chosenColor: string | null;
  scores: Record<string, number>;
}

// ─── Private hand — card IDs that the client looks up from FULL_DECK ───
export interface PlayerHand {
  cardIds: number[];
}

// ─── Deal info — sent when game starts ───
export interface DealInfo {
  playerId: string;
  cardIds: number[];
}
