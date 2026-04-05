import { GAME_RULES } from "@uno-flip/shared";

// ─── A player in a room ───
interface RoomPlayer {
  id: string; // socket ID
  name: string;
  connected: boolean;
}

// ─── A room ───
interface Room {
  code: string;
  players: RoomPlayer[];
  hostId: string; // first player = host (can start game)
  gameStarted: boolean;
}

// ─── All active rooms, keyed by room code ───
const rooms = new Map<string, Room>();

// ─── Generate a random 4-letter room code like "ABCD" ───
function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O (look like 1 and 0)
  let code: string;
  do {
    code = "";
    for (let i = 0; i < GAME_RULES.ROOM_CODE_LENGTH; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code)); // keep trying if code already exists
  return code;
}

// ─── Create a new room (empty — host joins separately with their name) ───
export function createRoom(hostId: string) {
  const code = generateRoomCode();
  const room: Room = {
    code,
    players: [],
    hostId,
    gameStarted: false,
  };
  rooms.set(code, room);
  return room;
}

// ─── Join an existing room ───
export function joinRoom(
  roomCode: string,
  playerId: string,
  playerName: string,
): { room: Room; player: RoomPlayer; error?: string } | { error: string } {
  const room = rooms.get(roomCode);

  if (!room) {
    return { error: `Room "${roomCode}" not found` };
  }
  if (room.gameStarted) {
    return { error: "Game already in progress" };
  }
  if (room.players.length >= GAME_RULES.MAX_PLAYERS) {
    return { error: `Room is full (max ${GAME_RULES.MAX_PLAYERS} players)` };
  }
  if (room.players.some((p) => p.name === playerName)) {
    return { error: `Name "${playerName}" is already taken` };
  }

  const player: RoomPlayer = {
    id: playerId,
    name: playerName,
    connected: true,
  };
  room.players.push(player);
  return { room, player };
}

// ─── Find which room a player is in ───
export function findRoomByPlayerId(playerId: string): Room | undefined {
  for (const room of rooms.values()) {
    if (room.players.some((p) => p.id === playerId)) {
      return room;
    }
  }
  return undefined;
}

// ─── Remove a player from their room ───
// Mid-game: marks disconnected (can rejoin). Lobby: fully removes.
export function removePlayer(
  playerId: string,
): { room: Room; wasHost: boolean; midGame: boolean } | undefined {
  const room = findRoomByPlayerId(playerId);
  if (!room) return undefined;

  const wasHost = room.hostId === playerId;

  if (room.gameStarted) {
    // Mid-game: mark disconnected, keep them for reconnection
    const player = room.players.find((p) => p.id === playerId);
    if (player) player.connected = false;

    // If everyone disconnected, delete the room
    const anyoneConnected = room.players.some((p) => p.connected);
    if (!anyoneConnected) {
      rooms.delete(room.code);
      return { room, wasHost, midGame: false };
    }

    if (wasHost) {
      const newHost = room.players.find(
        (p) => p.connected && p.id !== playerId,
      );
      if (newHost) room.hostId = newHost.id;
    }

    return { room, wasHost, midGame: true };
  }

  // Lobby: fully remove
  room.players = room.players.filter((p) => p.id !== playerId);

  if (room.players.length === 0) {
    rooms.delete(room.code);
    return { room, wasHost, midGame: false };
  }

  const newHost = room.players[0];
  if (wasHost && newHost) {
    room.hostId = newHost.id;
  }

  return { room, wasHost, midGame: false };
}

// ─── Reconnect a player who refreshed mid-game ───
export function rejoinRoom(
  roomCode: string,
  newSocketId: string,
  playerName: string,
): { room: Room; oldSocketId: string } | null {
  const room = rooms.get(roomCode);
  if (!room?.gameStarted) return null;

  const player = room.players.find(
    (p) => p.name === playerName && !p.connected,
  );
  if (!player) return null;

  const oldSocketId = player.id;
  player.id = newSocketId;
  player.connected = true;

  if (room.hostId === oldSocketId) {
    room.hostId = newSocketId;
  }

  return { room, oldSocketId };
}

// ─── Get a room by code ───
export function getRoom(code: string): Room | undefined {
  return rooms.get(code);
}

// ─── Get public player list for a room ───
export function getPublicPlayers(room: {
  players: { id: string; name: string; connected: boolean }[];
}) {
  return room.players.map((p) => ({
    id: p.id,
    name: p.name,
    cardCount: 0,
    cardIds: [] as number[],
    isUno: false,
    connected: p.connected,
  }));
}
