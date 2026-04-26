import type { DarkColor, LightColor } from "./card.js";
import type { DealInfo, GameState, PlayerHand, PublicPlayer } from "./game.js";

// ─── Client → Server events ───
export interface ClientToServerEvents {
  CREATE_ROOM: (data: { playerName: string }) => void;
  JOIN_ROOM: (data: { roomCode: string; playerName: string }) => void;
  START_GAME: () => void;
  PLAY_CARD: (data: { cardId: number }) => void;
  DRAW_CARD: () => void;
  CALL_UNO: () => void;
  CATCH_UNO: (data: { targetPlayerId: string }) => void;
  SEND_EMOTE: (data: { toId: string; emote: string }) => void;
  SELECT_COLOR: (data: { color: LightColor | DarkColor }) => void;
  PASS_TURN: () => void;
  START_NEXT_ROUND: () => void;
}

// ─── Server → Client events ───
export interface ServerToClientEvents {
  ROOM_CREATED: (data: { roomCode: string }) => void;
  PLAYER_JOINED: (data: { player: PublicPlayer }) => void;
  PLAYER_LEFT: (data: { playerId: string }) => void;
  GAME_STATE: (data: { gameState: GameState }) => void;
  HAND_UPDATE: (data: { hand: PlayerHand }) => void;
  DEAL_CARDS: (data: {
    deals: DealInfo[];
    discardTopCardId: number;
    drawPileCardIds: number[];
  }) => void;
  CARD_PLAYED: (data: { playerId: string; cardId: number }) => void;
  CARD_DRAWN: (data: { playerId: string; cardId: number }) => void;
  FLIP_EVENT: (data: { cardId: number }) => void;
  COLOR_CHOSEN: (data: { color: LightColor | DarkColor }) => void;
  UNO_CALLED: (data: { playerId: string; playerName: string }) => void;
  UNO_CAUGHT: (data: {
    catcherId: string;
    targetId: string;
    targetName: string;
  }) => void;
  EMOTE: (data: {
    fromId: string;
    toId: string;
    emote: string;
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
