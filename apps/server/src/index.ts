import { createServer } from "node:http";
import type {
  ClientToServerEvents,
  GameState,
  ServerToClientEvents,
} from "@uno-flip/shared";
import { FULL_DECK, GAME_RULES } from "@uno-flip/shared";
import express from "express";
import { Server } from "socket.io";
import {
  acceptDraw,
  callUno,
  catchUno,
  challengeDraw,
  createGame,
  type GameInstance,
  getPlayerHand,
  getPublicGameState,
  passTurn,
  playCard,
  playerDrawCard,
  selectColor,
} from "./game-engine.js";
import {
  createRoom,
  findRoomByPlayerId,
  getPublicPlayers,
  getRoom,
  joinRoom,
  removePlayer,
} from "./room-manager.js";

const app = express();

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "http://localhost:5173");
  next();
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "http://localhost:5173",
  },
});

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    deckSize: FULL_DECK.length,
    rules: GAME_RULES,
  });
});

app.get("/api/room/:code", (req, res) => {
  const room = getRoom(req.params.code.toUpperCase());
  if (!room) {
    res.status(404).json({ error: "Room not found" });
    return;
  }
  res.json({ exists: true, playerCount: room.players.length });
});

// ─── Active games, keyed by room code ───
const games = new Map<string, GameInstance>();

// ─── Helper: build lobby state ───
function lobbyState(room: {
  hostId: string;
  players: { id: string; name: string; connected: boolean }[];
}): GameState {
  return {
    phase: "lobby",
    activeSide: "light",
    discardTop: null,
    currentPlayerIndex: 0,
    direction: "clockwise",
    players: getPublicPlayers(room),
    drawPileCount: 0,
    hostId: room.hostId,
    chosenColor: null,
    challengeTarget: null,
  };
}

// ─── Helper: broadcast game state + private hands to all players ───
function broadcastGameState(roomCode: string, hostId: string): void {
  const game = games.get(roomCode);
  if (!game) return;

  const publicState = getPublicGameState(game, hostId);
  io.to(roomCode).emit("GAME_STATE", { gameState: publicState });

  // Send each player their private hand
  for (const playerId of game.playerIds) {
    const hand = getPlayerHand(game, playerId);
    io.to(playerId).emit("HAND_UPDATE", { hand: { cards: hand } });
  }
}

io.on("connection", (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // ─── CREATE ROOM ───
  socket.on("CREATE_ROOM", () => {
    const room = createRoom(socket.id);
    socket.emit("ROOM_CREATED", { roomCode: room.code });
    console.log(`Room ${room.code} created (host: ${socket.id})`);
  });

  // ─── JOIN ROOM ───
  socket.on("JOIN_ROOM", ({ roomCode, playerName }) => {
    const result = joinRoom(roomCode.toUpperCase(), socket.id, playerName);

    if (!("room" in result)) {
      socket.emit("ERROR", { message: result.error });
      return;
    }

    const { room, player } = result;
    socket.join(room.code);

    io.to(room.code).emit("PLAYER_JOINED", {
      player: {
        id: player.id,
        name: player.name,
        cardCount: 0,
        isUno: false,
        connected: true,
      },
    });

    io.to(room.code).emit("GAME_STATE", { gameState: lobbyState(room) });

    console.log(
      `${player.name} joined room ${room.code} (${room.players.length} players)`,
    );
  });

  // ─── START GAME ───
  socket.on("START_GAME", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.players.length < GAME_RULES.MIN_PLAYERS) return;

    const game = createGame(
      room.players.map((p) => ({ id: p.id, name: p.name })),
    );
    games.set(room.code, game);
    room.gameStarted = true;

    broadcastGameState(room.code, room.hostId);
    console.log(`Game started in room ${room.code}`);
  });

  // ─── PLAY CARD ───
  socket.on("PLAY_CARD", ({ cardId }) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const result = playCard(game, socket.id, cardId);

    if (!result.success) {
      socket.emit("ERROR", { message: result.error ?? "Invalid move" });
      return;
    }

    // Broadcast the card that was played
    if (result.cardPlayed) {
      io.to(room.code).emit("CARD_PLAYED", {
        playerId: socket.id,
        card: result.cardPlayed,
      });
    }

    // Broadcast flip event
    if (result.flip) {
      io.to(room.code).emit("FLIP_EVENT");
    }

    // Handle round/game over
    if (result.roundOver && result.winnerId && result.roundScores) {
      if (result.gameOver) {
        io.to(room.code).emit("GAME_OVER", {
          winnerId: result.winnerId,
          finalScores: Object.fromEntries(game.cumulativeScores),
        });
      } else {
        io.to(room.code).emit("ROUND_OVER", {
          winnerId: result.winnerId,
          scores: result.roundScores,
        });
      }
    }

    broadcastGameState(room.code, room.hostId);
  });

  // ─── DRAW CARD ───
  socket.on("DRAW_CARD", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const result = playerDrawCard(game, socket.id);

    if (!result.success) {
      socket.emit("ERROR", { message: result.error ?? "Can't draw" });
      return;
    }

    broadcastGameState(room.code, room.hostId);
  });

  // ─── PASS TURN (after drawing a playable card) ───
  socket.on("PASS_TURN", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    passTurn(game, socket.id);
    broadcastGameState(room.code, room.hostId);
  });

  // ─── SELECT COLOR (after playing a wild) ───
  socket.on("SELECT_COLOR", ({ color }) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const result = selectColor(game, socket.id, color);

    if (!result.success) {
      socket.emit("ERROR", { message: result.error ?? "Invalid color" });
      return;
    }

    broadcastGameState(room.code, room.hostId);
  });

  // ─── CALL UNO ───
  socket.on("CALL_UNO", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    callUno(game, socket.id);
    broadcastGameState(room.code, room.hostId);
  });

  // ─── CATCH UNO ───
  socket.on("CATCH_UNO", ({ targetPlayerId }) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const drawn = catchUno(game, socket.id, targetPlayerId);
    if (drawn) {
      broadcastGameState(room.code, room.hostId);
    }
  });

  // ─── ACCEPT DRAW (no challenge) ───
  socket.on("ACCEPT_DRAW", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const result = acceptDraw(game, socket.id);
    if (!result.success) {
      socket.emit("ERROR", { message: result.error ?? "Can't accept" });
      return;
    }

    broadcastGameState(room.code, room.hostId);
  });

  // ─── CHALLENGE DRAW ───
  socket.on("CHALLENGE_DRAW", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const result = challengeDraw(game, socket.id);
    if (!result.success) {
      socket.emit("ERROR", { message: result.error ?? "Can't challenge" });
      return;
    }

    io.to(room.code).emit("CHALLENGE_RESULT", {
      challengerId: socket.id,
      challengedId: result.penaltyPlayerId,
      success: result.challengeSuccess,
      penaltyCards: result.penaltyCards,
    });

    broadcastGameState(room.code, room.hostId);
  });

  // ─── DISCONNECT ───
  socket.on("disconnect", () => {
    const result = removePlayer(socket.id);
    if (result) {
      const { room } = result;
      io.to(room.code).emit("PLAYER_LEFT", { playerId: socket.id });

      if (room.players.length > 0) {
        io.to(room.code).emit("GAME_STATE", { gameState: lobbyState(room) });
      }

      console.log(`Player ${socket.id} left room ${room.code}`);
    }
  });
});

const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
