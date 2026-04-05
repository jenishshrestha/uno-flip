import type { Card, CardValue, GameState, PlayerHand } from "@uno-flip/shared";
import { FULL_DECK } from "@uno-flip/shared";
import { button, Leva, useControls } from "leva";
import { useCallback, useMemo, useState } from "react";
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
  });

  const handConfig = useControls("Hand", {
    screenY: { value: -0.8, min: -1.5, max: 0, step: 0.05 },
    cardSpacing: { value: 0.5, min: 0.1, max: 1.2, step: 0.05 },
    tiltX: { value: -1.5, min: -1.57, max: 0, step: 0.05 },
    cardScale: { value: 1.0, min: 0.5, max: 2.0, step: 0.1 },
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
        const ids = playerHands[`player-${i}`] ?? [];
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
    [playerCount, activeSide, cardCount, currentTurn, playerHands],
  );

  const mockHand: PlayerHand = useMemo(
    () => ({
      cardIds: (playerHands["player-0"] ?? []).filter(
        (id) => !removedCardIds.has(id),
      ),
    }),
    [playerHands, removedCardIds],
  );

  const handlePlayCard = useCallback((card: Card) => {
    setDiscardPile((prev) => [...prev, card]);
    setRemovedCardIds((prev) => new Set([...prev, card.id]));
  }, []);

  return (
    <>
      <Leva collapsed={false} />
      <ThreeGameScreen
        gameState={mockGameState}
        hand={mockHand}
        overrideMyId="player-0"
        handConfig={handConfig}
        demoDealing={shouldDeal}
        discardPile={discardPile}
        onPlayCard={handlePlayCard}
      />
    </>
  );
}
