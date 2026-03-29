import type { CardSide, DarkColor, LightColor } from "./card.js";
import type { GameState, PlayerHand, PublicPlayer } from "./game.js";

// ─── Client → Server events ───
// These are like API calls, but over WebSocket instead of HTTP.
// Instead of fetch("/api/play-card", ...) you do socket.emit("PLAY_CARD", ...)
export interface ClientToServerEvents {
  CREATE_ROOM: (data: { playerName: string }) => void;
  JOIN_ROOM: (data: { roomCode: string; playerName: string }) => void;
  START_GAME: () => void;
  PLAY_CARD: (data: { cardId: number }) => void;
  DRAW_CARD: () => void;
  CALL_UNO: () => void;
  CATCH_UNO: (data: { targetPlayerId: string }) => void;
  SELECT_COLOR: (data: { color: LightColor | DarkColor }) => void;
}

// ─── Server → Client events ───
// These are like push notifications from the server.
// Instead of polling "did anything change?", the server tells you instantly.
export interface ServerToClientEvents {
  ROOM_CREATED: (data: { roomCode: string }) => void;
  PLAYER_JOINED: (data: { player: PublicPlayer }) => void;
  PLAYER_LEFT: (data: { playerId: string }) => void;
  GAME_STATE: (data: { gameState: GameState }) => void;
  HAND_UPDATE: (data: { hand: PlayerHand }) => void;
  CARD_PLAYED: (data: { playerId: string; card: CardSide }) => void;
  FLIP_EVENT: () => void;
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
