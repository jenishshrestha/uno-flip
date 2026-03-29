import type { Card, CardSide } from "@uno-flip/shared";
import { FULL_DECK } from "@uno-flip/shared";

// ─── Fisher-Yates shuffle (the gold standard for randomizing arrays) ───
// Think of it like pulling random cards from a pile one by one
function shuffle<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j] as T;
    shuffled[j] = temp as T;
  }
  return shuffled;
}

// ─── The deck state for one game ───
export interface DeckState {
  drawPile: Card[];
  discardPile: Card[];
}

// ─── Create a fresh shuffled deck ───
export function createDeck(): DeckState {
  return {
    drawPile: shuffle([...FULL_DECK]),
    discardPile: [],
  };
}

// ─── Deal cards to players ───
// Returns a map of playerId → their hand
export function dealCards(
  deck: DeckState,
  playerIds: string[],
  cardsPerPlayer: number,
): Map<string, Card[]> {
  const hands = new Map<string, Card[]>();

  for (const id of playerIds) {
    hands.set(id, []);
  }

  // Deal one card at a time to each player (like a real dealer)
  for (let round = 0; round < cardsPerPlayer; round++) {
    for (const id of playerIds) {
      const card = deck.drawPile.pop();
      if (card) {
        hands.get(id)?.push(card);
      }
    }
  }

  return hands;
}

// ─── Flip the first card from draw pile to start the discard ───
export function flipStartingCard(deck: DeckState): CardSide | null {
  const card = deck.drawPile.pop();
  if (!card) return null;
  deck.discardPile.push(card);
  return card.light; // game always starts on light side
}

// ─── Draw a card from the draw pile ───
// If draw pile is empty, reshuffle the discard pile (except the top card)
export function drawCard(deck: DeckState): Card | null {
  if (deck.drawPile.length === 0) {
    reshuffleDiscardIntoDraw(deck);
  }

  return deck.drawPile.pop() ?? null;
}

// ─── Place a card on the discard pile ───
export function discard(deck: DeckState, card: Card): void {
  deck.discardPile.push(card);
}

// ─── Get the top card of the discard pile ───
export function getDiscardTop(deck: DeckState): Card | null {
  return deck.discardPile[deck.discardPile.length - 1] ?? null;
}

// ─── Reshuffle discard into draw (when draw pile runs out) ───
// Keeps the top discard card in place
function reshuffleDiscardIntoDraw(deck: DeckState): void {
  if (deck.discardPile.length <= 1) return;

  const topCard = deck.discardPile.pop();
  if (!topCard) return;
  deck.drawPile = shuffle(deck.discardPile);
  deck.discardPile = [topCard];
}
