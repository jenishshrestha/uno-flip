import { createServer } from "node:http";
import { networkInterfaces } from "node:os";
import type {
  ClientToServerEvents,
  GameState,
  ServerToClientEvents,
} from "@uno-flip/shared";
import { FULL_DECK, GAME_RULES } from "@uno-flip/shared";
import express from "express";
import { Server } from "socket.io";
import {
  callUno,
  catchUno,
  createGame,
  type GameInstance,
  getDealInfo,
  getPlayerHandIds,
  getPublicGameState,
  passTurn,
  playCard,
  playerDrawCard,
  reconnectPlayer,
  selectColor,
  startNextRound,
} from "./game-engine.js";
import {
  createRoom,
  findRoomByPlayerId,
  getPublicPlayers,
  getRoom,
  joinRoom,
  rejoinRoom,
  removePlayer,
} from "./room-manager.js";

const app = express();

app.use((_req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  next();
});

const httpServer = createServer(app);

const io = new Server<ClientToServerEvents, ServerToClientEvents>(httpServer, {
  cors: {
    origin: "*",
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
    drawPileCardIds: [],
    hostId: room.hostId,
    chosenColor: null,
    scores: {},
  };
}

// ─── Helper: broadcast game state + private hands to all players ───
function broadcastGameState(roomCode: string, hostId: string): void {
  const game = games.get(roomCode);
  if (!game) return;

  const publicState = getPublicGameState(game, hostId);
  io.to(roomCode).emit("GAME_STATE", { gameState: publicState });

  // Send each player their private hand (card IDs)
  for (const playerId of game.playerIds) {
    const cardIds = getPlayerHandIds(game, playerId);
    io.to(playerId).emit("HAND_UPDATE", { hand: { cardIds } });
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
    const code = roomCode.toUpperCase();

    // Try mid-game reconnection first
    const rejoin = rejoinRoom(code, socket.id, playerName);
    if (rejoin) {
      const { room, oldSocketId } = rejoin;
      socket.join(room.code);

      const game = games.get(room.code);
      if (game) {
        reconnectPlayer(game, oldSocketId, socket.id);
        broadcastGameState(room.code, room.hostId);
      }

      console.log(`${playerName} reconnected to room ${room.code}`);
      return;
    }

    // Normal join (pre-game)
    const result = joinRoom(code, socket.id, playerName);

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
        cardIds: [],
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

    // Send deal info — all players' card assignments
    const dealInfo = getDealInfo(game);
    io.to(room.code).emit("DEAL_CARDS", {
      deals: dealInfo.deals,
      discardTopCardId: dealInfo.discardTopCardId,
      drawPileCardIds: game.deck.drawPile.map((c) => c.id),
    });

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
    if (result.cardPlayedId !== undefined) {
      io.to(room.code).emit("CARD_PLAYED", {
        playerId: socket.id,
        cardId: result.cardPlayedId,
      });
    }

    // Broadcast flip event with the card that triggered it, so the client
    // can flip just that pile entry.
    if (result.flip && result.cardPlayedId !== undefined) {
      io.to(room.code).emit("FLIP_EVENT", { cardId: result.cardPlayedId });
    }

    // Broadcast each forced draw (e.g., draw_one / draw_five action effects)
    // as a CARD_DRAWN event so clients animate them flying to the target.
    if (result.drawTargetId && result.drawnByNext) {
      const targetId = result.drawTargetId;
      for (const card of result.drawnByNext) {
        io.to(room.code).emit("CARD_DRAWN", {
          playerId: targetId,
          cardId: card.id,
        });
      }
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

    if (result.card) {
      io.to(room.code).emit("CARD_DRAWN", {
        playerId: socket.id,
        cardId: result.card.id,
      });
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

    io.to(room.code).emit("COLOR_CHOSEN", { color });

    // Wild draw cards: broadcast each forced draw to the targeted player.
    if (result.drawTargetId && result.drawnByNext) {
      const targetId = result.drawTargetId;
      for (const card of result.drawnByNext) {
        io.to(room.code).emit("CARD_DRAWN", {
          playerId: targetId,
          cardId: card.id,
        });
      }
    }

    broadcastGameState(room.code, room.hostId);
  });

  // ─── CALL UNO ───
  socket.on("CALL_UNO", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const success = callUno(game, socket.id);
    if (success) {
      const name = game.playerNames.get(socket.id) ?? "Someone";
      io.to(room.code).emit("UNO_CALLED", {
        playerId: socket.id,
        playerName: name,
      });
      broadcastGameState(room.code, room.hostId);
    }
  });

  // ─── CATCH UNO ───
  socket.on("CATCH_UNO", ({ targetPlayerId }) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    const game = games.get(room.code);
    if (!game) return;

    const drawn = catchUno(game, socket.id, targetPlayerId);
    if (drawn) {
      const targetName = game.playerNames.get(targetPlayerId) ?? "Someone";
      io.to(room.code).emit("UNO_CAUGHT", {
        catcherId: socket.id,
        targetId: targetPlayerId,
        targetName,
      });
      broadcastGameState(room.code, room.hostId);
    }
  });

  // ─── EMOTE ───
  // Pure social signal — no game-state mutation, just rebroadcast.
  socket.on("SEND_EMOTE", ({ toId, emote }) => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    io.to(room.code).emit("EMOTE", {
      fromId: socket.id,
      toId,
      emote,
    });
  });

  // ─── START NEXT ROUND ───
  socket.on("START_NEXT_ROUND", () => {
    const room = findRoomByPlayerId(socket.id);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    const game = games.get(room.code);
    if (!game || game.phase !== "round_over") return;

    startNextRound(game);

    // Same broadcast pattern as START_GAME so the client wipes its discard
    // pile and seeds it with the new starting card.
    const dealInfo = getDealInfo(game);
    io.to(room.code).emit("DEAL_CARDS", {
      deals: dealInfo.deals,
      discardTopCardId: dealInfo.discardTopCardId,
      drawPileCardIds: game.deck.drawPile.map((c) => c.id),
    });

    broadcastGameState(room.code, room.hostId);
    console.log(`Next round started in room ${room.code}`);
  });

  // ─── DISCONNECT ───
  socket.on("disconnect", () => {
    const result = removePlayer(socket.id);
    if (!result) return;

    const { room, midGame } = result;

    if (midGame) {
      // Mid-game: mark disconnected in game engine, broadcast updated state
      const game = games.get(room.code);
      if (game) {
        game.connectedPlayers.delete(socket.id);
        broadcastGameState(room.code, room.hostId);
      }
      console.log(
        `Player ${socket.id} disconnected mid-game from room ${room.code}`,
      );
      return;
    }

    // Room was deleted (all disconnected mid-game or lobby empty) — clean up game
    games.delete(room.code);

    // Lobby: fully removed
    io.to(room.code).emit("PLAYER_LEFT", { playerId: socket.id });

    if (room.players.length > 0) {
      io.to(room.code).emit("GAME_STATE", { gameState: lobbyState(room) });
    }

    console.log(`Player ${socket.id} left room ${room.code}`);
  });
});

const PORT = 3001;
httpServer.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running at http://localhost:${PORT}`);

  // Print LAN IP so other devices on the same WiFi can connect
  const nets = networkInterfaces();
  for (const addrs of Object.values(nets)) {
    if (!addrs) continue;
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        console.log(`  LAN: http://${addr.address}:${PORT}`);
      }
    }
  }
});
