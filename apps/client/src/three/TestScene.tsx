import type { Card, CardValue, GameState, PlayerHand } from "@uno-flip/shared";
import { DECK_MAP, FULL_DECK } from "@uno-flip/shared";
import { button, Leva, useControls } from "leva";
import { useCallback, useMemo, useState } from "react";
import type { DrawRequest, OpponentPlay } from "./ThreeGameScreen.js";
import { ThreeGameScreen } from "./ThreeGameScreen.js";

const FAKE_NAMES = [
  "Jenish",
  "Alice",
  "Bob",
  "Charlie",
  "Diana",
  "Eve",
  "Frank",
  "Grace",
  "Hank",
  "Ivy",
];

export function TestScene() {
  const [activeSide, setActiveSide] = useState<"light" | "dark">("light");
  const [shouldDeal, setShouldDeal] = useState(false);
  const [discardPile, setDiscardPile] = useState<Card[]>([]);
  const [removedCardIds, setRemovedCardIds] = useState<Set<number>>(new Set());
  const [opponentPlay, setOpponentPlay] = useState<OpponentPlay | null>(null);
  const [drawRequest, setDrawRequest] = useState<DrawRequest | null>(null);
  // Cards drawn post-deal, appended to each player's initial round-robin hand
  const [extraCardIds, setExtraCardIds] = useState<Record<string, number[]>>(
    {},
  );

  const { playerCount, cardCount, currentTurn, deckOffset } = useControls(
    "Game",
    {
      playerCount: { value: 2, min: 2, max: 10, step: 1 },
      cardCount: { value: 7, min: 1, max: 20, step: 1 },
      currentTurn: {
        value: 0,
        min: 0,
        max: 9,
        step: 1,
        label: "Whose turn (0=you)",
      },
      deckOffset: {
        value: 0,
        min: 0,
        max: 100,
        step: 1,
        label: "Deck offset (which cards to show)",
      },
    },
  );

  useControls("Actions", {
    "Deal Cards (demo)": button(() => {
      setShouldDeal(false);
      requestAnimationFrame(() => setShouldDeal(true));
    }),
    "Flip Cards": button(() => {
      setActiveSide((s) => (s === "light" ? "dark" : "light"));
    }),
    "Opponent plays": button(() => {
      triggerOpponentPlay();
    }),
    "I draw": button(() => {
      triggerDraw("player-0");
    }),
    "Opponent draws": button(() => {
      // Pick a random opponent
      const oppIdx =
        1 + Math.floor(Math.random() * Math.max(playerCount - 1, 1));
      if (oppIdx >= playerCount) return;
      triggerDraw(`player-${oppIdx}`);
    }),
  });

  const handConfig = useControls("Hand", {
    screenY: { value: -0.8, min: -1.5, max: 0, step: 0.05 },
    cardSpacing: { value: 0.5, min: 0.1, max: 1.2, step: 0.05 },
    tiltX: { value: -1.5, min: -1.57, max: 0, step: 0.05 },
    cardScale: { value: 1.0, min: 0.5, max: 2.0, step: 0.1 },
  });

  const discardConfig = useControls("Discard", {
    screenLeft: { value: 50, min: 0, max: 100, step: 1 },
    screenTop: { value: 50, min: 0, max: 100, step: 1 },
    scale: { value: 1.0, min: 0.3, max: 2.0, step: 0.05 },
    tiltX: { value: -1.5, min: -Math.PI, max: Math.PI, step: 0.05 },
    tiltY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    tiltZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
  });

  const deckConfig = useControls("Deck", {
    screenLeft: { value: 82, min: 0, max: 100, step: 1 },
    screenTop: { value: 90, min: 0, max: 100, step: 1 },
    scale: { value: 1.0, min: 0.3, max: 2.0, step: 0.05 },
    tiltX: { value: -1.5, min: -Math.PI, max: Math.PI, step: 0.05 },
    tiltY: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
    tiltZ: { value: 0, min: -Math.PI, max: Math.PI, step: 0.05 },
  });

  // Deal cards from the real deck to all players (round-robin)
  const playerHands = useMemo(() => {
    const deck = [...FULL_DECK].slice(deckOffset);
    const hands: Record<string, number[]> = {};

    for (let p = 0; p < playerCount; p++) {
      hands[`player-${p}`] = [];
    }

    let deckIndex = 0;
    for (let round = 0; round < cardCount; round++) {
      for (let p = 0; p < playerCount; p++) {
        const card = deck[deckIndex];
        if (card) {
          hands[`player-${p}`]?.push(card.id);
        }
        deckIndex++;
      }
    }
    return hands;
  }, [cardCount, deckOffset, playerCount]);

  const mockGameState: GameState = useMemo(
    () => ({
      phase: "playing",
      activeSide,
      discardTop: { color: "yellow", value: 5 as CardValue },
      currentPlayerIndex: currentTurn % playerCount,
      direction: "clockwise",
      drawPileCount: 112 - playerCount * cardCount - 1,
      hostId: "player-0",
      chosenColor: null,
      challengeTarget: null,
      scores: {},
      players: Array.from({ length: playerCount }, (_, i) => {
        const initial = (playerHands[`player-${i}`] ?? []).filter(
          (id) => !removedCardIds.has(id),
        );
        const extras = (extraCardIds[`player-${i}`] ?? []).filter(
          (id) => !removedCardIds.has(id),
        );
        const ids = [...initial, ...extras];
        return {
          id: `player-${i}`,
          name: FAKE_NAMES[i] ?? `P${i + 1}`,
          cardCount: ids.length,
          cardIds: ids,
          isUno: ids.length === 1,
          connected: true,
        };
      }),
    }),
    [
      playerCount,
      activeSide,
      cardCount,
      currentTurn,
      playerHands,
      removedCardIds,
      extraCardIds,
    ],
  );

  const mockHand: PlayerHand = useMemo(
    () => ({
      cardIds: [
        ...(playerHands["player-0"] ?? []),
        ...(extraCardIds["player-0"] ?? []),
      ].filter((id) => !removedCardIds.has(id)),
    }),
    [playerHands, removedCardIds, extraCardIds],
  );

  const handlePlayCard = useCallback((card: Card) => {
    setDiscardPile((prev) => [...prev, card]);
    setRemovedCardIds((prev) => new Set([...prev, card.id]));
  }, []);

  const handleOpponentPlayComplete = useCallback(() => {
    setOpponentPlay((current) => {
      if (!current) return null;
      setDiscardPile((prev) => [...prev, current.card]);
      setRemovedCardIds((prev) => new Set([...prev, current.card.id]));
      return null;
    });
  }, []);

  const handleDrawComplete = useCallback((card: Card, playerId: string) => {
    setExtraCardIds((prev) => ({
      ...prev,
      [playerId]: [...(prev[playerId] ?? []), card.id],
    }));
    setDrawRequest(null);
  }, []);

  const triggerDraw = useCallback(
    (playerId: string) => {
      if (drawRequest) return;
      setDrawRequest({ playerId });
    },
    [drawRequest],
  );

  // Trigger a simulated opponent play — picks a random opponent with cards
  // and throws their last card. Reads from latest state via refs inside.
  const triggerOpponentPlay = useCallback(() => {
    if (opponentPlay) return; // already in flight
    const candidates: { id: string; cardIds: number[] }[] = [];
    for (let i = 1; i < playerCount; i++) {
      const ids = (playerHands[`player-${i}`] ?? []).filter(
        (id) => !removedCardIds.has(id),
      );
      if (ids.length > 0) candidates.push({ id: `player-${i}`, cardIds: ids });
    }
    if (candidates.length === 0) return;
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    if (!pick) return;
    const cardId = pick.cardIds[pick.cardIds.length - 1];
    if (cardId === undefined) return;
    const card = DECK_MAP.get(cardId);
    if (!card) return;
    setOpponentPlay({ playerId: pick.id, card });
  }, [opponentPlay, playerCount, playerHands, removedCardIds]);

  return (
    <>
      <Leva collapsed={false} />
      <ThreeGameScreen
        gameState={mockGameState}
        hand={mockHand}
        overrideMyId="player-0"
        handConfig={handConfig}
        deckConfig={deckConfig}
        discardConfig={discardConfig}
        demoDealing={shouldDeal}
        onDemoDealingComplete={() => setShouldDeal(false)}
        discardPile={discardPile}
        onPlayCard={handlePlayCard}
        opponentPlay={opponentPlay}
        onOpponentPlayComplete={handleOpponentPlayComplete}
        drawRequest={drawRequest}
        onDrawComplete={handleDrawComplete}
        onDeckClick={triggerDraw}
      />
    </>
  );
}
