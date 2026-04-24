import type {
  Card,
  DarkColor,
  GameState,
  LightColor,
  PlayerHand,
  PublicPlayer,
} from "@uno-flip/shared";
import { canPlayCard, DECK_MAP } from "@uno-flip/shared";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ScoreScreen } from "./screens/ScoreScreen.js";
import { SERVER_URL, socket } from "./socket.js";
import { playUnoSound } from "./sounds.js";
import { styles } from "./styles.js";
import { ChallengeOverlay } from "./three/overlays/ChallengeOverlay.js";
import { ColorPickerOverlay } from "./three/overlays/ColorPickerOverlay.js";
import { FlipOverlay } from "./three/overlays/FlipOverlay.js";
import { TestScene } from "./three/TestScene.js";
import type { DrawRequest, OpponentPlay } from "./three/ThreeGameScreen.js";
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
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [opponentPlay, setOpponentPlay] = useState<OpponentPlay | null>(null);
  const [drawRequest, setDrawRequest] = useState<DrawRequest | null>(null);
  const [flipShowing, setFlipShowing] = useState(false);
  // Non-null while it's my turn AND I just drew a card that is legal to play.
  // Presence of this value is what drives the `Pass` button visibility.
  const [pendingDrawnCardId, setPendingDrawnCardId] = useState<number | null>(
    null,
  );

  const isHost = hostId === socket.id;
  const currentPlayerId =
    gameState?.players[gameState.currentPlayerIndex]?.id ?? null;

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
      // Clear transient animation state when returning to lobby / between rounds
      if (gs.phase === "lobby" || gs.phase === "dealing") {
        setDiscardPile([]);
        setOpponentPlay(null);
        setDrawRequest(null);
        setPendingDrawnCardId(null);
      }
      // If the turn has moved off me, the pending draw no longer applies.
      const activeId = gs.players[gs.currentPlayerIndex]?.id;
      if (activeId !== socket.id) setPendingDrawnCardId(null);
    });

    socket.on("HAND_UPDATE", ({ hand: h }) => {
      setHand(h);
    });

    socket.on("DEAL_CARDS", ({ discardTopCardId }) => {
      const top = DECK_MAP.get(discardTopCardId);
      setDiscardPile(top ? [top] : []);
    });

    socket.on("CARD_PLAYED", ({ playerId, cardId }) => {
      const card = DECK_MAP.get(cardId);
      if (!card) return;
      if (playerId === socket.id) {
        // Our own play — local animation + optimistic commit already handled.
        return;
      }
      // Opponent play — trigger throw animation; discard pile is appended
      // when the animation completes (see handleOpponentPlayComplete).
      // No toast — the played card is visible landing on the discard pile.
      setOpponentPlay({ playerId, card });
    });

    socket.on("CARD_DRAWN", ({ playerId, cardId }) => {
      // Trigger a draw animation for whoever drew (local or opponent).
      setDrawRequest({ playerId, cardId });
      // If I drew and the card is legal on the current discard top, I now
      // have the option to play it or pass. The server keeps the turn with
      // me until I do one of those.
      if (playerId === socket.id) {
        const card = DECK_MAP.get(cardId);
        const top = gameState?.discardTop;
        if (
          card &&
          top &&
          canPlayCard(card, top, gameState.activeSide, gameState.chosenColor)
        ) {
          setPendingDrawnCardId(cardId);
        } else {
          setPendingDrawnCardId(null);
        }
      }
    });

    socket.on("FLIP_EVENT", () => {
      // Server reverses its discard pile on flip — mirror that client-side
      // so the top card and stacking order stay in sync.
      setDiscardPile((prev) => [...prev].reverse());
      setFlipShowing(true);
      setTimeout(() => setFlipShowing(false), 1200);
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
      // Roll back an optimistic play if the server rejected it.
      // Client-side validation should prevent this in normal play, but the
      // safety net keeps the visual discard pile consistent if anything slips.
      if (message === "Can't play that card" || message === "Not your turn") {
        setDiscardPile((prev) => prev.slice(0, -1));
      }
    });

    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("ROOM_CREATED");
      socket.off("PLAYER_JOINED");
      socket.off("PLAYER_LEFT");
      socket.off("GAME_STATE");
      socket.off("HAND_UPDATE");
      socket.off("DEAL_CARDS");
      socket.off("CARD_PLAYED");
      socket.off("CARD_DRAWN");
      socket.off("FLIP_EVENT");
      socket.off("UNO_CALLED");
      socket.off("UNO_CAUGHT");
      socket.off("CHALLENGE_RESULT");
      socket.off("ROUND_OVER");
      socket.off("GAME_OVER");
      socket.off("ERROR");
    };
  }, [players, gameState]);

  // Local play: the throw animation just landed — emit the play to the server
  // and commit the card to our local discard pile so the pile visually
  // retains it during the brief round-trip before the server echoes back.
  const handleLocalPlayCard = useCallback((card: Card) => {
    socket.emit("PLAY_CARD", { cardId: card.id });
    setDiscardPile((prev) => [...prev, card]);
    setPendingDrawnCardId(null);
  }, []);

  const handlePass = useCallback(() => {
    socket.emit("PASS_TURN");
    setPendingDrawnCardId(null);
  }, []);

  const handleCatchUno = useCallback((targetPlayerId: string) => {
    socket.emit("CATCH_UNO", { targetPlayerId });
  }, []);

  // Opponent throw animation finished — commit the flying card to the pile.
  const handleOpponentPlayComplete = useCallback(() => {
    setOpponentPlay((current) => {
      if (!current) return null;
      setDiscardPile((prev) => [...prev, current.card]);
      return null;
    });
  }, []);

  const handleDrawComplete = useCallback(() => {
    setDrawRequest(null);
  }, []);

  const handleDeckClick = useCallback((playerId: string) => {
    // Only the acting player can request a draw; server validates turn anyway.
    if (playerId === socket.id) socket.emit("DRAW_CARD");
  }, []);

  const handleColorSelect = useCallback((color: LightColor | DarkColor) => {
    socket.emit("SELECT_COLOR", { color });
  }, []);

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
    const isMyTurn = currentPlayerId === socket.id;
    return (
      <>
        <Toaster position="top-center" theme="dark" />
        <ThreeGameScreen
          gameState={gameState}
          hand={hand}
          discardPile={discardPile}
          onPlayCard={handleLocalPlayCard}
          opponentPlay={opponentPlay}
          onOpponentPlayComplete={handleOpponentPlayComplete}
          drawRequest={drawRequest}
          onDrawComplete={handleDrawComplete}
          onDeckClick={handleDeckClick}
          showPass={isMyTurn && pendingDrawnCardId !== null}
          onPass={handlePass}
          onCatchUno={handleCatchUno}
        />
        <ColorPickerOverlay
          show={gameState.phase === "choosing_color" && isMyTurn}
          activeSide={gameState.activeSide}
          onSelect={handleColorSelect}
        />
        <ChallengeOverlay
          show={
            gameState.phase === "awaiting_challenge" &&
            gameState.challengeTarget === socket.id
          }
        />
        <FlipOverlay show={flipShowing} />
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
