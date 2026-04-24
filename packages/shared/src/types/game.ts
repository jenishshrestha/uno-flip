import type { ActiveSide, CardSide } from "./card.js";

// ─── Game phases (state machine) ───
export type GamePhase =
  | "lobby"
  | "dealing"
  | "playing"
  | "choosing_color"
  | "awaiting_challenge"
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
  drawPileCount: number;
  // Card ID of the top of the draw pile, or null when empty. The rest of
  // the deck stays private on the server; only the visible top is exposed
  // (per UNO Flip's physical setup where the top card's inactive face is
  // visible to all players).
  drawPileTopCardId: number | null;
  hostId: string;
  chosenColor: string | null;
  challengeTarget: string | null;
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
