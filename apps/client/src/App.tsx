import type {
  Card,
  DarkColor,
  GameState,
  LightColor,
  PlayerHand,
  PublicPlayer,
} from "@uno-flip/shared";
import { DECK_MAP } from "@uno-flip/shared";
import { useCallback, useEffect, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ScoreScreen } from "./screens/ScoreScreen.js";
import { SERVER_URL, socket } from "./socket.js";
import { playColorSound, playUnoSound } from "./sounds.js";
import { styles } from "./styles.js";
import type { DiscardEntry } from "./three/components/DiscardPile3D.js";
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

// `navigator.clipboard` is only available in secure contexts (HTTPS or
// localhost). On LAN IPs (e.g. 192.168.x.x) it's blocked, so fall back to
// the legacy execCommand approach which works everywhere.
async function copyToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // fall through
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
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
  const [discardPile, setDiscardPile] = useState<DiscardEntry[]>([]);
  const [opponentPlay, setOpponentPlay] = useState<OpponentPlay | null>(null);
  // Queue so a multi-card forced draw (draw_one / draw_five / wild_draw_two
  // / wild_draw_color) animates one card at a time. PlayArea consumes the
  // head of the queue; on completion we pop and feed the next.
  const [drawQueue, setDrawQueue] = useState<DrawRequest[]>([]);
  const drawRequest = drawQueue[0] ?? null;
  const [flipShowing, setFlipShowing] = useState(false);
  // FLIP_EVENT may arrive before the flip card has finished its throw
  // animation. Park the cardId here and apply the side flip once the entry
  // appears in `discardPile`.
  const [pendingFlipCardId, setPendingFlipCardId] = useState<number | null>(
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
        setDrawQueue([]);
        setPendingFlipCardId(null);
      }
    });

    socket.on("HAND_UPDATE", ({ hand: h }) => {
      setHand(h);
    });

    socket.on("DEAL_CARDS", ({ discardTopCardId }) => {
      const top = DECK_MAP.get(discardTopCardId);
      // Game always starts on light.
      setDiscardPile(top ? [{ card: top, side: "light" }] : []);
    });

    socket.on("CARD_PLAYED", ({ playerId, cardId }) => {
      const card = DECK_MAP.get(cardId);
      if (!card) return;
      if (playerId === socket.id) {
        // Our own play — local animation + optimistic commit already handled.
        return;
      }
      // Capture the side at play time. By the time the throw animation
      // lands (~0.55s) FLIP_EVENT/GAME_STATE may have updated activeSide;
      // this ensures the thrown card lands on the face it was played on.
      // PlayArea handles the wild-card buffering (it waits for chosenColor
      // before firing the throw).
      const sidePlayedOn = gameState?.activeSide ?? "light";
      setOpponentPlay({ playerId, card, sidePlayedOn });
    });

    socket.on("CARD_DRAWN", ({ playerId, cardId }) => {
      // Append to the queue. PlayArea animates the head and we pop on
      // completion. Multi-card forced draws (e.g. draw_five) arrive as
      // a burst of CARD_DRAWN events and animate one after another.
      setDrawQueue((q) => [...q, { playerId, cardId }]);
    });

    socket.on("COLOR_CHOSEN", ({ color }) => {
      // Discrete event so the cue plays for every client even if the same
      // color is picked twice in a row (gameState.chosenColor wouldn't change).
      playColorSound(color);
    });

    socket.on("FLIP_EVENT", ({ cardId }) => {
      // No pile reorder. The flip card stays on top; we just queue a side
      // change for that specific entry. The DiscardCard component will
      // animate the 180° flip when the entry's side changes (which happens
      // either now or once the throw animation lands and adds the card).
      setPendingFlipCardId(cardId);
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
      socket.off("COLOR_CHOSEN");
      socket.off("UNO_CALLED");
      socket.off("UNO_CAUGHT");
      socket.off("ROUND_OVER");
      socket.off("GAME_OVER");
      socket.off("ERROR");
    };
  }, [players, gameState]);

  // Apply a pending FLIP_EVENT once (a) the flip card has actually landed in
  // the pile and (b) the new activeSide has arrived via GAME_STATE. A small
  // delay lets the entry mount on its played-on side first so the change to
  // its `side` prop triggers the DiscardCard's flip animation (no animation
  // would play if mount and side update happen in the same tick).
  useEffect(() => {
    if (pendingFlipCardId === null) return;
    if (!gameState) return;
    const idx = discardPile.findIndex((e) => e.card.id === pendingFlipCardId);
    if (idx === -1) return;
    const entry = discardPile[idx];
    if (!entry || entry.side === gameState.activeSide) {
      setPendingFlipCardId(null);
      return;
    }
    const newSide = gameState.activeSide;
    const timer = setTimeout(() => {
      setDiscardPile((prev) =>
        prev.map((e, i) => (i === idx ? { ...e, side: newSide } : e)),
      );
      setPendingFlipCardId(null);
    }, 80);
    return () => clearTimeout(timer);
  }, [pendingFlipCardId, discardPile, gameState]);

  // Local play: the throw animation just landed — emit the play to the server
  // and commit the card to our local discard pile so the pile visually
  // retains it during the brief round-trip before the server echoes back.
  const handleLocalPlayCard = useCallback(
    (card: Card) => {
      socket.emit("PLAY_CARD", { cardId: card.id });
      const side = gameState?.activeSide ?? "light";
      setDiscardPile((prev) => [...prev, { card, side }]);
    },
    [gameState?.activeSide],
  );

  const handlePass = useCallback(() => {
    socket.emit("PASS_TURN");
  }, []);

  const handleCatchUno = useCallback((targetPlayerId: string) => {
    socket.emit("CATCH_UNO", { targetPlayerId });
  }, []);

  // Opponent throw animation finished — commit the flying card to the pile
  // on the side it was played on. PlayArea passes the play back so we don't
  // need to chase the latest opponentPlay state from inside an updater
  // (which would double-fire under StrictMode).
  const handleOpponentPlayComplete = useCallback((play: OpponentPlay) => {
    setDiscardPile((prev) => [
      ...prev,
      { card: play.card, side: play.sidePlayedOn },
    ]);
    setOpponentPlay(null);
  }, []);

  const handleDrawComplete = useCallback(() => {
    setDrawQueue((q) => q.slice(1));
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
          showPass={false}
          onPass={handlePass}
          onCatchUno={handleCatchUno}
        />
        <ColorPickerOverlay
          show={gameState.phase === "choosing_color" && isMyTurn}
          activeSide={gameState.activeSide}
          onSelect={handleColorSelect}
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
          <button
            type="button"
            onClick={async () => {
              const url = window.location.href;
              const ok = await copyToClipboard(url);
              if (ok) toast.success("Link copied!");
              else toast.error("Couldn't copy link");
            }}
            style={{
              marginTop: 12,
              padding: "8px 16px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.2)",
              background: "rgba(255,255,255,0.08)",
              color: "white",
              fontSize: 13,
              fontFamily: "system-ui",
              cursor: "pointer",
            }}
          >
            Copy invite link
          </button>
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
