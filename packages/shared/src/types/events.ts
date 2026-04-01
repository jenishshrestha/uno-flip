import type { CardSide, DarkColor, LightColor } from "./card.js";
import type { GameState, PlayerHand, PublicPlayer } from "./game.js";

// ─── Client → Server events ───
export interface ClientToServerEvents {
  CREATE_ROOM: (data: { playerName: string }) => void;
  JOIN_ROOM: (data: { roomCode: string; playerName: string }) => void;
  START_GAME: () => void;
  PLAY_CARD: (data: { cardId: number }) => void;
  DRAW_CARD: () => void;
  CALL_UNO: () => void;
  CATCH_UNO: (data: { targetPlayerId: string }) => void;
  SELECT_COLOR: (data: { color: LightColor | DarkColor }) => void;
  PASS_TURN: () => void; // pass after drawing a playable card
  CHALLENGE_DRAW: () => void; // target challenges a wild draw two/color
  ACCEPT_DRAW: () => void; // target accepts the draw penalty
  START_NEXT_ROUND: () => void; // host starts the next round (keeps cumulative scores)
}

// ─── Server → Client events ───
export interface ServerToClientEvents {
  ROOM_CREATED: (data: { roomCode: string }) => void;
  PLAYER_JOINED: (data: { player: PublicPlayer }) => void;
  PLAYER_LEFT: (data: { playerId: string }) => void;
  GAME_STATE: (data: { gameState: GameState }) => void;
  HAND_UPDATE: (data: { hand: PlayerHand }) => void;
  CARD_PLAYED: (data: { playerId: string; card: CardSide }) => void;
  FLIP_EVENT: () => void;
  UNO_CALLED: (data: { playerId: string; playerName: string }) => void;
  UNO_CAUGHT: (data: {
    catcherId: string;
    targetId: string;
    targetName: string;
  }) => void;
  CHALLENGE_RESULT: (data: {
    challengerId: string;
    challengedId: string;
    success: boolean; // true = illegal play caught, false = legal play
    penaltyCards: number;
  }) => void;
  ROUND_OVER: (data: {
    winnerId: string;
    scores: Record<string, number>;
  }) => void;
  GAME_OVER: (data: {
    winnerId: string;
    finalScores: Record<string, number>;
  }) => void;
  ERROR: (data: { message: string }) => void;
}
