import type {
  ActiveSide,
  Card,
  CardSide,
  Direction,
  GamePhase,
  GameState,
  PublicPlayer,
} from "@uno-flip/shared";
import { GAME_RULES } from "@uno-flip/shared";
import { drawUntilColor, forceDrawCards, resolveAction } from "./actions.js";
import {
  createDeck,
  type DeckState,
  dealCards,
  discard,
  drawCard,
  flipStartingCard,
  getDiscardTop,
} from "./deck.js";
import { calculateRoundScores, totalWinnerPoints } from "./scoring.js";
import { canPlayCard } from "./validators.js";

// ─── Internal game state (server only — never sent to clients directly) ───
export interface GameInstance {
  phase: GamePhase;
  activeSide: ActiveSide;
  direction: Direction;
  currentPlayerIndex: number;
  playerIds: string[]; // ordered list of player IDs
  playerNames: Map<string, string>;
  hands: Map<string, Card[]>; // each player's cards
  deck: DeckState;
  chosenColor: string | null; // color picked after a wild
  discardTopSide: CardSide | null;
  calledUno: Set<string>; // players who called UNO
  cumulativeScores: Map<string, number>; // total scores across rounds
}

// ─── Create a new game from a list of players ───
export function createGame(
  players: { id: string; name: string }[],
): GameInstance {
  const game: GameInstance = {
    phase: "dealing",
    activeSide: "light",
    direction: "clockwise",
    currentPlayerIndex: 0,
    playerIds: players.map((p) => p.id),
    playerNames: new Map(players.map((p) => [p.id, p.name])),
    hands: new Map(),
    deck: createDeck(),
    chosenColor: null,
    discardTopSide: null,
    calledUno: new Set(),
    cumulativeScores: new Map(players.map((p) => [p.id, 0])),
  };

  // Deal cards
  game.hands = dealCards(
    game.deck,
    game.playerIds,
    GAME_RULES.CARDS_PER_PLAYER,
  );

  // Flip the starting card
  game.discardTopSide = flipStartingCard(game.deck);

  // Handle if starting card is an action
  if (game.discardTopSide) {
    handleStartingCard(game);
  }

  game.phase = "playing";
  return game;
}

// ─── Handle edge cases when the starting card is an action ───
function handleStartingCard(game: GameInstance): void {
  if (!game.discardTopSide) return;
  const value = game.discardTopSide.value;

  // If starting card is a wild draw — reshuffle and try again
  if (value === "wild_draw_two" || value === "wild_draw_color") {
    game.deck.discardPile = [];
    game.deck = createDeck();
    game.hands = dealCards(
      game.deck,
      game.playerIds,
      GAME_RULES.CARDS_PER_PLAYER,
    );
    game.discardTopSide = flipStartingCard(game.deck);
    if (game.discardTopSide) {
      handleStartingCard(game); // recurse if another bad card
    }
    return;
  }

  const action = resolveAction(value, game.activeSide);
  if (action.reverse) {
    game.direction =
      game.direction === "clockwise" ? "counter_clockwise" : "clockwise";
  }
  if (action.skip) {
    advanceTurn(game);
  }
  if (action.flip) {
    flipGame(game);
  }
}

// ─── Play a card ───
export interface PlayResult {
  success: boolean;
  error?: string;
  needsColorChoice?: boolean;
  flip?: boolean;
  cardPlayed?: CardSide;
  drawnByNext?: Card[];
  skippedPlayerId?: string;
  roundOver?: boolean;
  gameOver?: boolean;
  winnerId?: string;
  roundScores?: Record<string, number>;
}

export function playCard(
  game: GameInstance,
  playerId: string,
  cardId: number,
): PlayResult {
  // Validate it's this player's turn
  if (game.phase !== "playing") {
    return { success: false, error: "Not in playing phase" };
  }
  if (game.playerIds[game.currentPlayerIndex] !== playerId) {
    return { success: false, error: "Not your turn" };
  }

  // Find the card in their hand
  const hand = game.hands.get(playerId);
  if (!hand) return { success: false, error: "Player not found" };

  const cardIndex = hand.findIndex((c) => c.id === cardId);
  if (cardIndex === -1) {
    return { success: false, error: "Card not in your hand" };
  }

  const card = hand[cardIndex];
  if (!card) return { success: false, error: "Card not found" };

  // Validate the card can be played
  if (
    game.discardTopSide &&
    !canPlayCard(card, game.discardTopSide, game.activeSide, game.chosenColor)
  ) {
    return { success: false, error: "Can't play that card" };
  }

  // Remove card from hand, place on discard
  hand.splice(cardIndex, 1);
  discard(game.deck, card);

  const cardFace = game.activeSide === "light" ? card.light : card.dark;
  game.discardTopSide = cardFace;
  game.chosenColor = null; // reset chosen color

  // Check if player won the round (empty hand)
  if (hand.length === 0) {
    return handleRoundWin(game, playerId, cardFace);
  }

  // Resolve action effects
  const action = resolveAction(cardFace.value, game.activeSide);
  const result: PlayResult = {
    success: true,
    cardPlayed: cardFace,
    needsColorChoice: action.needsColorChoice,
    flip: action.flip,
  };

  // Handle flip
  if (action.flip) {
    flipGame(game);
  }

  // If wild card, wait for color choice before advancing
  if (action.needsColorChoice) {
    game.phase = "choosing_color";
    return result;
  }

  // Handle reverse
  if (action.reverse) {
    game.direction =
      game.direction === "clockwise" ? "counter_clockwise" : "clockwise";
    // In 2-player mode, reverse acts as skip
    if (game.playerIds.length === 2) {
      action.skip = true;
    }
  }

  // Advance turn
  advanceTurn(game);

  // Handle skip + draw effects on the next player
  if (action.skip || action.drawCards !== 0) {
    const targetId = game.playerIds[game.currentPlayerIndex];
    if (!targetId) return result;
    const targetHand = game.hands.get(targetId);
    result.skippedPlayerId = targetId;

    if (targetHand && action.drawCards > 0) {
      result.drawnByNext = forceDrawCards(
        game.deck,
        targetHand,
        action.drawCards,
      );
    }

    // Skip over the target player
    if (action.skip) {
      advanceTurn(game);
    }
  }

  return result;
}

// ─── Player draws a card ───
export interface DrawResult {
  success: boolean;
  error?: string;
  card?: Card;
}

export function playerDrawCard(
  game: GameInstance,
  playerId: string,
): DrawResult {
  if (game.phase !== "playing") {
    return { success: false, error: "Not in playing phase" };
  }
  if (game.playerIds[game.currentPlayerIndex] !== playerId) {
    return { success: false, error: "Not your turn" };
  }

  const hand = game.hands.get(playerId);
  if (!hand) return { success: false, error: "Player not found" };

  const card = drawCard(game.deck);
  if (!card) return { success: false, error: "No cards to draw" };

  hand.push(card);

  // After drawing, advance to next player
  advanceTurn(game);

  return { success: true, card };
}

// ─── Select color after playing a wild ───
export function selectColor(
  game: GameInstance,
  playerId: string,
  color: string,
): PlayResult {
  if (game.phase !== "choosing_color") {
    return { success: false, error: "Not choosing a color" };
  }
  if (game.playerIds[game.currentPlayerIndex] !== playerId) {
    return { success: false, error: "Not your turn" };
  }

  game.chosenColor = color;
  game.phase = "playing";

  // Now apply the draw effect if it was a wild draw card
  const result: PlayResult = { success: true };

  if (game.discardTopSide) {
    const action = resolveAction(game.discardTopSide.value, game.activeSide);

    advanceTurn(game);

    if (action.drawCards !== 0) {
      const targetId = game.playerIds[game.currentPlayerIndex];
      if (!targetId) return result;
      const targetHand = game.hands.get(targetId);
      result.skippedPlayerId = targetId;

      if (targetHand) {
        if (action.drawCards === -1) {
          // Wild Draw Color — draw until they get the chosen color
          result.drawnByNext = drawUntilColor(
            game.deck,
            targetHand,
            color,
            game.activeSide,
          );
        } else {
          result.drawnByNext = forceDrawCards(
            game.deck,
            targetHand,
            action.drawCards,
          );
        }
      }

      if (action.skip) {
        advanceTurn(game);
      }
    }
  }

  return result;
}

// ─── Call UNO ───
export function callUno(game: GameInstance, playerId: string): boolean {
  const hand = game.hands.get(playerId);
  if (!hand || hand.length !== 1) return false;
  game.calledUno.add(playerId);
  return true;
}

// ─── Catch someone who forgot to call UNO ───
export function catchUno(
  game: GameInstance,
  _catcherId: string,
  targetId: string,
): Card[] | null {
  const targetHand = game.hands.get(targetId);
  if (!targetHand) return null;
  if (targetHand.length !== 1) return null;
  if (game.calledUno.has(targetId)) return null;

  // Penalty: draw 2 cards
  return forceDrawCards(game.deck, targetHand, 2);
}

// ─── Flip the game (light ↔ dark) ───
function flipGame(game: GameInstance): void {
  game.activeSide = game.activeSide === "light" ? "dark" : "light";

  // Update the discard top to show the new active side
  const topCard = getDiscardTop(game.deck);
  if (topCard) {
    game.discardTopSide =
      game.activeSide === "light" ? topCard.light : topCard.dark;
  }
}

// ─── Advance to the next player's turn ───
function advanceTurn(game: GameInstance): void {
  const step = game.direction === "clockwise" ? 1 : -1;
  game.currentPlayerIndex =
    (game.currentPlayerIndex + step + game.playerIds.length) %
    game.playerIds.length;
}

// ─── Handle a round win ───
function handleRoundWin(
  game: GameInstance,
  winnerId: string,
  cardPlayed: CardSide,
): PlayResult {
  game.phase = "round_over";

  const roundScores = calculateRoundScores(
    game.hands,
    winnerId,
    game.activeSide,
  );
  const winnerPoints = totalWinnerPoints(roundScores);

  // Update cumulative scores
  const currentScore = game.cumulativeScores.get(winnerId) ?? 0;
  game.cumulativeScores.set(winnerId, currentScore + winnerPoints);

  // Check if game is over (500 points)
  const gameOver =
    (game.cumulativeScores.get(winnerId) ?? 0) >= GAME_RULES.WIN_SCORE;
  if (gameOver) {
    game.phase = "game_over";
  }

  return {
    success: true,
    cardPlayed,
    roundOver: true,
    gameOver,
    winnerId,
    roundScores,
  };
}

// ─── Get the public game state (safe to send to all clients) ───
export function getPublicGameState(
  game: GameInstance,
  hostId: string,
): GameState {
  const players: PublicPlayer[] = game.playerIds.map((id) => ({
    id,
    name: game.playerNames.get(id) ?? "Unknown",
    cardCount: game.hands.get(id)?.length ?? 0,
    isUno: game.calledUno.has(id),
    connected: true,
  }));

  return {
    phase: game.phase,
    activeSide: game.activeSide,
    discardTop: game.discardTopSide,
    currentPlayerIndex: game.currentPlayerIndex,
    direction: game.direction,
    players,
    drawPileCount: game.deck.drawPile.length,
    hostId,
    chosenColor: game.chosenColor,
  };
}

// ─── Get a player's hand (private — only sent to them) ───
export function getPlayerHand(game: GameInstance, playerId: string): Card[] {
  return game.hands.get(playerId) ?? [];
}
