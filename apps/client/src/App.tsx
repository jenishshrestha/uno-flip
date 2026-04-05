import type {
  Card,
  GameState,
  PlayerHand,
  PublicPlayer,
} from "@uno-flip/shared";
import { DECK_MAP } from "@uno-flip/shared";
import { useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ScoreScreen } from "./screens/ScoreScreen.js";
import { SERVER_URL, socket } from "./socket.js";
import { playUnoSound } from "./sounds.js";
import { styles } from "./styles.js";
import { TestScene } from "./three/TestScene.js";
import { ThreeGameScreen } from "./three/ThreeGameScreen.js";

function getHash() {
  return window.location.hash.slice(1) || "/";
}

function navigate(path: string) {
  window.location.hash = path;
}

function App() {
  const [hash, setHash] = useState(getHash());
  const [playerName, setPlayerName] = useState("");
  const [players, setPlayers] = useState<PublicPlayer[]>([]);
  const [hostId, setHostId] = useState("");
  const [joined, setJoined] = useState(false);
  const [connected, setConnected] = useState(socket.connected);
  const [roomValid, setRoomValid] = useState<boolean | null>(null);
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hand, setHand] = useState<PlayerHand | null>(null);

  const isHost = hostId === socket.id;

  useEffect(() => {
    const onHashChange = () => {
      setHash(getHash());
      setRoomValid(null);
      setJoined(false);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  // Validate room
  useEffect(() => {
    if (!hash.startsWith("/room/")) return;
    const code = hash.split("/room/")[1] ?? "";
    if (!code) return;

    fetch(`${SERVER_URL}/api/room/${code}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        setRoomValid(true);
      })
      .catch(() => {
        toast.error("Room not found");
        navigate("/");
      });
  }, [hash]);

  // Socket events
  useEffect(() => {
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));

    socket.on("ROOM_CREATED", ({ roomCode }) => {
      setRoomValid(true);
      navigate(`/room/${roomCode}`);
    });

    socket.on("PLAYER_JOINED", ({ player }) => {
      setPlayers((prev) => {
        if (prev.some((p) => p.id === player.id)) return prev;
        return [...prev, player];
      });
    });

    socket.on("PLAYER_LEFT", ({ playerId }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    });

    socket.on("GAME_STATE", ({ gameState: gs }) => {
      setGameState(gs);
      setPlayers(gs.players);
      setHostId(gs.hostId);
      setJoined(true);
    });

    socket.on("HAND_UPDATE", ({ hand: h }) => {
      setHand(h);
    });

    socket.on("CARD_PLAYED", ({ playerId, cardId }) => {
      const name = players.find((p) => p.id === playerId)?.name ?? "Someone";
      const card = DECK_MAP.get(cardId);
      if (playerId !== socket.id && card) {
        const face = gameState?.activeSide === "light" ? card.light : card.dark;
        toast(`${name} played ${face.value}`);
      }
    });

    socket.on("FLIP_EVENT", () => {
      toast("FLIP! All cards flipped!");
    });

    socket.on("UNO_CALLED", ({ playerName, playerId }) => {
      playUnoSound();
      if (playerId === socket.id) {
        toast.success("You called UNO!");
      } else {
        toast(`${playerName} called UNO!`);
      }
    });

    socket.on("UNO_CAUGHT", ({ targetName, targetId }) => {
      if (targetId === socket.id) {
        toast.error("You were caught! Draw 2 cards");
      } else {
        toast(`${targetName} was caught! +2 cards`);
      }
    });

    socket.on("CHALLENGE_RESULT", ({ success, penaltyCards }) => {
      if (success) {
        toast.success(
          `Challenge succeeded! Offender draws ${penaltyCards} cards`,
        );
      } else {
        toast.error(`Challenge failed! Challenger draws ${penaltyCards} cards`);
      }
    });

    socket.on("ROUND_OVER", ({ winnerId }) => {
      const name = players.find((p) => p.id === winnerId)?.name ?? "Someone";
      toast.success(`${name} won the round!`);
    });

    socket.on("GAME_OVER", ({ winnerId }) => {
      const name = players.find((p) => p.id === winnerId)?.name ?? "Someone";
      toast.success(`${name} won the game!`);
    });

    socket.on("ERROR", ({ message }) => {
      toast.error(message);
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("ROOM_CREATED");
      socket.off("PLAYER_JOINED");
      socket.off("PLAYER_LEFT");
      socket.off("GAME_STATE");
      socket.off("HAND_UPDATE");
      socket.off("CARD_PLAYED");
      socket.off("FLIP_EVENT");
      socket.off("UNO_CALLED");
      socket.off("UNO_CAUGHT");
      socket.off("CHALLENGE_RESULT");
      socket.off("ROUND_OVER");
      socket.off("GAME_OVER");
      socket.off("ERROR");
    };
  }, [players, gameState]);

  // ─── SCORE SCREEN ───
  if (
    gameState &&
    (gameState.phase === "round_over" || gameState.phase === "game_over")
  ) {
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        <ScoreScreen gameState={gameState} />
      </>
    );
  }

  // ─── GAME SCREEN ───
  if (
    gameState &&
    gameState.phase !== "lobby" &&
    gameState.phase !== "dealing" &&
    hand
  ) {
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        <ThreeGameScreen gameState={gameState} hand={hand} />
      </>
    );
  }

  // ─── TEST SCENE (dev only) ───
  if (hash === "/test") {
    return <TestScene />;
  }

  // ─── HOME ───
  if (hash === "/") {
    return (
      <div style={styles.container}>
        <Toaster position="top-center" theme="dark" />
        <h1 style={styles.title}>UNO Flip</h1>
        <p style={styles.subtitle}>Local Multiplayer Card Game</p>
        <button
          type="button"
          onClick={() => socket.emit("CREATE_ROOM", { playerName: "" })}
          disabled={!connected}
          style={{
            ...styles.primaryButton,
            maxWidth: 240,
            opacity: connected ? 1 : 0.5,
          }}
        >
          Play
        </button>
        {!connected && (
          <p style={{ color: "#888", fontSize: 13, marginTop: 12 }}>
            Connecting to server...
          </p>
        )}
      </div>
    );
  }

  // ─── ROOM ───
  if (hash.startsWith("/room/")) {
    const code = hash.split("/room/")[1] ?? "";

    if (roomValid === null) {
      return (
        <div style={styles.container}>
          <Toaster position="top-center" theme="dark" />
          <p style={{ color: "#888" }}>Checking room...</p>
        </div>
      );
    }

    // Name entry
    if (!joined) {
      return (
        <div style={styles.container}>
          <Toaster position="top-center" theme="dark" />
          <h1 style={styles.title}>UNO Flip</h1>
          <div style={styles.roomCodeBox}>
            <p style={styles.roomCodeLabel}>Joining Room</p>
            <p style={styles.roomCode}>{code}</p>
          </div>

          <input
            type="text"
            placeholder="Enter your name"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            style={styles.input}
            maxLength={15}
          />

          <button
            type="button"
            onClick={() => {
              if (!playerName.trim()) {
                toast.error("Please enter your name");
                return;
              }
              socket.emit("JOIN_ROOM", {
                roomCode: code,
                playerName: playerName.trim(),
              });
            }}
            style={styles.primaryButton}
          >
            Join Game
          </button>
        </div>
      );
    }

    // Lobby
    return (
      <div style={styles.container}>
        <Toaster position="top-center" theme="dark" />
        <div style={styles.roomCodeBox}>
          <p style={styles.roomCodeLabel}>Room Code</p>
          <p style={styles.roomCode}>{code}</p>
          <p style={styles.roomCodeHint}>Share this URL with other players</p>
        </div>

        <div style={styles.section}>
          <h2 style={styles.sectionTitle}>Players ({players.length})</h2>
          <ul style={styles.playerList}>
            {players.map((player) => (
              <li key={player.id} style={styles.playerItem}>
                <span>{player.name}</span>
                <div style={{ display: "flex", gap: 4 }}>
                  {hostId === player.id && (
                    <span style={styles.hostBadge}>HOST</span>
                  )}
                  {player.id === socket.id && (
                    <span style={styles.youBadge}>YOU</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {isHost && (
          <button
            type="button"
            onClick={() => socket.emit("START_GAME")}
            disabled={players.length < 2}
            style={{
              ...styles.primaryButton,
              opacity: players.length < 2 ? 0.5 : 1,
              cursor: players.length < 2 ? "not-allowed" : "pointer",
            }}
          >
            {players.length < 2
              ? "Waiting for players..."
              : `Start Game (${players.length} players)`}
          </button>
        )}

        {!isHost && (
          <p style={{ color: "#888", fontStyle: "italic" }}>
            Waiting for host to start the game...
          </p>
        )}
      </div>
    );
  }

  navigate("/");
  return null;
}

export default App;
