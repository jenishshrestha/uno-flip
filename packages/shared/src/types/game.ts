import type { ActiveSide, Card, CardSide } from "./card.js";

// ─── Game phases (like a state machine) ───
// Think of it like React component lifecycle, but for the game:
//   LOBBY → waiting for players
//   DEALING → cards being dealt
//   PLAYING → someone needs to play a card
//   CHOOSING_COLOR → someone played a wild, picking a color
//   ROUND_OVER → someone emptied their hand, round scored
//   GAME_OVER → someone hit 500 points, game done
export type GamePhase =
  | "lobby"
  | "dealing"
  | "playing"
  | "choosing_color"
  | "awaiting_challenge" // after wild draw two/color, target can accept or challenge
  | "round_over"
  | "game_over";

// ─── Direction of play ───
export type Direction = "clockwise" | "counter_clockwise";

// ─── Public info about a player (visible to everyone) ───
export interface PublicPlayer {
  id: string; // socket ID
  name: string;
  cardCount: number; // how many cards they're holding
  isUno: boolean; // did they call UNO?
  connected: boolean; // still in the game?
}

// ─── What everyone can see about the current game ───
export interface GameState {
  phase: GamePhase;
  activeSide: ActiveSide; // are we on light or dark side?
  discardTop: CardSide | null; // top card of the discard pile
  currentPlayerIndex: number; // whose turn is it? (index into players array)
  direction: Direction;
  players: PublicPlayer[];
  drawPileCount: number; // how many cards left to draw
  hostId: string; // socket ID of the host
  chosenColor: string | null; // color chosen after a wild card
  challengeTarget: string | null; // player ID who can challenge a wild draw
}

// ─── Private info sent only to the owning player ───
// The server sends this to YOU and only you — other players never see your cards
export interface PlayerHand {
  cards: Card[]; // your actual cards (both sides, since you hold them)
}
