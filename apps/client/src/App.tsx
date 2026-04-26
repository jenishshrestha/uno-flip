import type {
  Card,
  DarkColor,
  GameState,
  LightColor,
  PlayerHand,
  PublicPlayer,
} from "@uno-flip/shared";
import { DECK_MAP, getActiveFace } from "@uno-flip/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Toaster, toast } from "sonner";
import "./App.css";
import { ScoreScreen } from "./screens/ScoreScreen.js";
import { SERVER_URL, socket } from "./socket.js";
import {
  playColorSound,
  playFlipCardSound,
  playReverseSound,
  playSkipSound,
  playThrowSound,
  playUnoSound,
} from "./sounds.js";
import { styles } from "./styles.js";
import type { DiscardEntry } from "./three/components/DiscardPile3D.js";
import { ColorPickerOverlay } from "./three/overlays/ColorPickerOverlay.js";
import { FlipOverlay } from "./three/overlays/FlipOverlay.js";
import { TestScene } from "./three/TestScene.js";
import type {
  DrawRequest,
  EmoteFlight,
  OpponentPlay,
} from "./three/ThreeGameScreen.js";
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
  // Active emote flights between players. Each entry self-removes when the
  // flying-emoji animation finishes (handled by onEmoteFlightLand below).
  const [emoteFlights, setEmoteFlights] = useState<EmoteFlight[]>([]);
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

  // Latest gameState / players for handlers — they're registered once with
  // empty deps so the closure can't read fresh React state directly. Refs
  // bridge that gap without causing the listener to re-bind on every change.
  const gameStateRef = useRef<GameState | null>(null);
  const playersRef = useRef<PublicPlayer[]>([]);
  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);
  useEffect(() => {
    playersRef.current = players;
  }, [players]);

  // Socket events — registered once on mount, passing function refs to
  // socket.off so we don't accidentally remove other listeners.
  useEffect(() => {
    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    const onRoomCreated = ({ roomCode }: { roomCode: string }) => {
      setRoomValid(true);
      navigate(`/room/${roomCode}`);
    };

    const onPlayerJoined = ({ player }: { player: PublicPlayer }) => {
      setPlayers((prev) => {
        if (prev.some((p) => p.id === player.id)) return prev;
        return [...prev, player];
      });
    };

    const onPlayerLeft = ({ playerId }: { playerId: string }) => {
      setPlayers((prev) => prev.filter((p) => p.id !== playerId));
    };

    const onGameState = ({ gameState: gs }: { gameState: GameState }) => {
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
        setEmoteFlights([]);
      }
    };

    const onHandUpdate = ({ hand: h }: { hand: PlayerHand }) => {
      setHand(h);
    };

    const onDealCards = ({
      discardTopCardId,
    }: {
      discardTopCardId: number;
    }) => {
      const top = DECK_MAP.get(discardTopCardId);
      // Game always starts on light.
      setDiscardPile(top ? [{ card: top, side: "light" }] : []);
    };

    const onCardPlayed = ({
      playerId,
      cardId,
    }: {
      playerId: string;
      cardId: number;
    }) => {
      const card = DECK_MAP.get(cardId);
      if (!card) return;
      // Action-card sound cues fire for everyone (including the player who
      // played the card) so the table reacts in unison.
      const sidePlayedOn = gameStateRef.current?.activeSide ?? "light";
      const face = getActiveFace(card, sidePlayedOn);
      if (face.value === "skip" || face.value === "skip_everyone") {
        playSkipSound();
      } else if (face.value === "reverse") {
        playReverseSound();
      }
      if (playerId === socket.id) {
        // Our own play — local animation + optimistic commit already handled.
        return;
      }
      // PlayArea handles the wild-card buffering (it waits for chosenColor
      // before firing the throw).
      setOpponentPlay({ playerId, card, sidePlayedOn });
    };

    const onCardDrawn = ({
      playerId,
      cardId,
    }: {
      playerId: string;
      cardId: number;
    }) => {
      // Append to the queue. PlayArea animates the head and we pop on
      // completion. Multi-card forced draws (e.g. draw_five) arrive as
      // a burst of CARD_DRAWN events and animate one after another.
      setDrawQueue((q) => [...q, { playerId, cardId }]);
    };

    const onColorChosen = ({ color }: { color: LightColor | DarkColor }) => {
      // Discrete event so the cue plays for every client even if the same
      // color is picked twice in a row (gameState.chosenColor wouldn't change).
      playColorSound(color);
    };

    const onEmote = ({
      fromId,
      toId,
      emote,
    }: {
      fromId: string;
      toId: string;
      emote: string;
    }) => {
      // Append a new flight; the in-component AnimatePresence + onComplete
      // callback fires onEmoteFlightLand which removes it from the array.
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      setEmoteFlights((prev) => [...prev, { id, fromId, toId, emote }]);
      playThrowSound();
    };

    const onFlipEvent = ({ cardId }: { cardId: number }) => {
      // No pile reorder. The flip card stays on top; we just queue a side
      // change for that specific entry. The DiscardCard component will
      // animate the 180° flip when the entry's side changes (which happens
      // either now or once the throw animation lands and adds the card).
      playFlipCardSound();
      setPendingFlipCardId(cardId);
      setFlipShowing(true);
      setTimeout(() => setFlipShowing(false), 1200);
      toast("FLIP! All cards flipped!");
    };

    const onUnoCalled = ({
      playerName,
      playerId,
    }: {
      playerName: string;
      playerId: string;
    }) => {
      playUnoSound();
      if (playerId === socket.id) {
        toast.success("You called UNO!");
      } else {
        toast(`${playerName} called UNO!`);
      }
    };

    const onUnoCaught = ({
      targetName,
      targetId,
    }: {
      targetName: string;
      targetId: string;
    }) => {
      if (targetId === socket.id) {
        toast.error("You were caught! Draw 2 cards");
      } else {
        toast(`${targetName} was caught! +2 cards`);
      }
    };

    const onRoundOver = ({ winnerId }: { winnerId: string }) => {
      const name =
        playersRef.current.find((p) => p.id === winnerId)?.name ?? "Someone";
      toast.success(`${name} won the round!`);
    };

    const onGameOver = ({ winnerId }: { winnerId: string }) => {
      const name =
        playersRef.current.find((p) => p.id === winnerId)?.name ?? "Someone";
      toast.success(`${name} won the game!`);
    };

    const onError = ({ message }: { message: string }) => {
      toast.error(message);
      // Roll back an optimistic play if the server rejected it.
      // Client-side validation should prevent this in normal play, but the
      // safety net keeps the visual discard pile consistent if anything slips.
      if (message === "Can't play that card" || message === "Not your turn") {
        setDiscardPile((prev) => prev.slice(0, -1));
      }
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("ROOM_CREATED", onRoomCreated);
    socket.on("PLAYER_JOINED", onPlayerJoined);
    socket.on("PLAYER_LEFT", onPlayerLeft);
    socket.on("GAME_STATE", onGameState);
    socket.on("HAND_UPDATE", onHandUpdate);
    socket.on("DEAL_CARDS", onDealCards);
    socket.on("CARD_PLAYED", onCardPlayed);
    socket.on("CARD_DRAWN", onCardDrawn);
    socket.on("COLOR_CHOSEN", onColorChosen);
    socket.on("EMOTE", onEmote);
    socket.on("FLIP_EVENT", onFlipEvent);
    socket.on("UNO_CALLED", onUnoCalled);
    socket.on("UNO_CAUGHT", onUnoCaught);
    socket.on("ROUND_OVER", onRoundOver);
    socket.on("GAME_OVER", onGameOver);
    socket.on("ERROR", onError);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("ROOM_CREATED", onRoomCreated);
      socket.off("PLAYER_JOINED", onPlayerJoined);
      socket.off("PLAYER_LEFT", onPlayerLeft);
      socket.off("GAME_STATE", onGameState);
      socket.off("HAND_UPDATE", onHandUpdate);
      socket.off("DEAL_CARDS", onDealCards);
      socket.off("CARD_PLAYED", onCardPlayed);
      socket.off("CARD_DRAWN", onCardDrawn);
      socket.off("COLOR_CHOSEN", onColorChosen);
      socket.off("EMOTE", onEmote);
      socket.off("FLIP_EVENT", onFlipEvent);
      socket.off("UNO_CALLED", onUnoCalled);
      socket.off("UNO_CAUGHT", onUnoCaught);
      socket.off("ROUND_OVER", onRoundOver);
      socket.off("GAME_OVER", onGameOver);
      socket.off("ERROR", onError);
    };
  }, []);

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

  const handleSendEmote = useCallback((toId: string, emote: string) => {
    socket.emit("SEND_EMOTE", { toId, emote });
  }, []);

  const handleEmoteFlightLand = useCallback((id: string) => {
    setEmoteFlights((prev) => prev.filter((f) => f.id !== id));
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
          emoteFlights={emoteFlights}
          onEmoteFlightLand={handleEmoteFlightLand}
          onSendEmote={handleSendEmote}
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
