import type {
  ActiveSide,
  Card,
  CardSide,
  CardValue,
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
  getDiscardTop,
} from "./deck.js";
import { calculateRoundScores, totalWinnerPoints } from "./scoring.js";
import { canPlayCard, isWildDrawLegal } from "./validators.js";

// ─── Internal game state (server only) ───
export interface GameInstance {
  phase: GamePhase;
  activeSide: ActiveSide;
  direction: Direction;
  currentPlayerIndex: number;
  playerIds: string[];
  playerNames: Map<string, string>;
  hands: Map<string, Card[]>;
  deck: DeckState;
  chosenColor: string | null;
  discardTopSide: CardSide | null;
  calledUno: Set<string>;
  cumulativeScores: Map<string, number>;
  // Challenge state
  challengeTarget: string | null; // player who can challenge
  challengedPlayerId: string | null; // player who played the wild draw
  pendingDrawAction: CardValue | null; // the wild draw card value being challenged
  wildDrawWasLegal: boolean; // was the wild draw played legally? (for challenge resolution)
}

// ─── Create a new game ───
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
    challengeTarget: null,
    challengedPlayerId: null,
    pendingDrawAction: null,
    wildDrawWasLegal: true,
  };

  // Deal 7 cards to each player
  game.hands = dealCards(
    game.deck,
    game.playerIds,
    GAME_RULES.CARDS_PER_PLAYER,
  );

  // Flip starting card and handle special starting cards
  flipStartingCard(game);
  game.phase = "playing";
  return game;
}

// ─── Flip the starting card with official rules for action/wild starters ───
function flipStartingCard(game: GameInstance): void {
  const card = game.deck.drawPile.pop();
  if (!card) return;

  game.deck.discardPile.push(card);
  game.discardTopSide = card.light; // always starts on light side
  const value = card.light.value;

  // Handle starting card rules per official UNO Flip rules
  if (value === "wild_draw_two" || value === "wild_draw_color") {
    // Official rule: return it to the draw pile, reshuffle, flip a new card.
    // Keep the already-dealt hands intact.
    game.deck.discardPile.pop();
    game.deck.drawPile.push(card);
    // Shuffle draw pile
    for (let i = game.deck.drawPile.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = game.deck.drawPile[i];
      game.deck.drawPile[i] = game.deck.drawPile[j] as typeof temp;
      game.deck.drawPile[j] = temp as typeof temp;
    }
    flipStartingCard(game);
    return;
  }

  if (value === "wild") {
    // Wild: first player chooses a color (handled by setting phase)
    // For simplicity, we let the first player choose on their turn
    return;
  }

  if (value === "skip" || value === "skip_everyone") {
    // Skip: first player is skipped
    advanceTurn(game);
    return;
  }

  if (value === "reverse") {
    if (game.playerIds.length === 2) {
      // 2-player: Reverse acts as Skip — first player is skipped
      advanceTurn(game);
    } else {
      // 3+ players: direction changes, dealer (last player) goes first
      game.direction = "counter_clockwise";
      game.currentPlayerIndex = game.playerIds.length - 1;
    }
    return;
  }

  if (value === "draw_one") {
    // Draw One: first player draws 1 and loses turn
    const firstHand = game.hands.get(
      game.playerIds[game.currentPlayerIndex] ?? "",
    );
    if (firstHand) forceDrawCards(game.deck, firstHand, 1);
    advanceTurn(game);
    return;
  }

  if (value === "flip") {
    // Flip: everything flips to dark side immediately
    performFlip(game);
    return;
  }
}

// ─── Play result ───
export interface PlayResult {
  success: boolean;
  error?: string;
  needsColorChoice?: boolean;
  flip?: boolean;
  cardPlayed?: CardSide;
  drawnByNext?: Card[];
  skippedPlayerIds?: string[];
  roundOver?: boolean;
  gameOver?: boolean;
  winnerId?: string;
  roundScores?: Record<string, number>;
  awaitingChallenge?: boolean;
}

// ─── Play a card ───
export function playCard(
  game: GameInstance,
  playerId: string,
  cardId: number,
): PlayResult {
  if (game.phase !== "playing") {
    return { success: false, error: "Not in playing phase" };
  }
  if (game.playerIds[game.currentPlayerIndex] !== playerId) {
    return { success: false, error: "Not your turn" };
  }

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

  const cardFace = game.activeSide === "light" ? card.light : card.dark;
  const action = resolveAction(cardFace.value);

  // Track wild draw legality BEFORE removing the card from hand
  // (the card is still in hand, so isWildDrawLegal checks correctly)
  if (action.isWildDraw) {
    game.wildDrawWasLegal = isWildDrawLegal(
      hand,
      game.discardTopSide ?? cardFace,
      game.activeSide,
      game.chosenColor,
    );
  }

  // Remove card from hand, place on discard
  hand.splice(cardIndex, 1);
  discard(game.deck, card);
  game.discardTopSide = cardFace;
  game.chosenColor = null;

  // Check UNO call — player going to 1 card should have called UNO
  if (hand.length === 1) {
    // They'll need to call UNO before the next player acts
  }

  // Check if player won the round (empty hand)
  if (hand.length === 0) {
    return handleRoundWin(game, playerId, cardFace, action);
  }

  const result: PlayResult = {
    success: true,
    cardPlayed: cardFace,
    needsColorChoice: action.needsColorChoice,
    flip: action.flip,
  };

  // Handle flip
  if (action.flip) {
    performFlip(game);
  }

  // If wild card, wait for color choice before advancing
  if (action.needsColorChoice) {
    game.phase = "choosing_color";
    // Track if this was a wild draw (for challenge after color choice)
    if (action.isWildDraw) {
      game.challengedPlayerId = playerId;
      game.pendingDrawAction = cardFace.value;
    }
    return result;
  }

  // Apply non-wild action effects
  applyActionEffects(game, action, result);

  return result;
}

// ─── Apply action effects (skip, reverse, draw) after a card is played ───
function applyActionEffects(
  game: GameInstance,
  action: ReturnType<typeof resolveAction>,
  result: PlayResult,
): void {
  // Handle reverse
  if (action.reverse) {
    game.direction =
      game.direction === "clockwise" ? "counter_clockwise" : "clockwise";
    // 2-player: reverse acts as skip
    if (game.playerIds.length === 2) {
      action.skip = true;
    }
  }

  // Handle skip everyone (dark side) — skip ALL other players, current player goes again
  if (action.skipEveryone) {
    // Don't advance turn — current player goes again
    result.skippedPlayerIds = game.playerIds.filter(
      (id) => id !== game.playerIds[game.currentPlayerIndex],
    );
    return;
  }

  // Advance to next player
  advanceTurn(game);

  // Handle skip + draw on the next player
  if (action.skip || action.drawCards > 0) {
    const targetId = game.playerIds[game.currentPlayerIndex];
    if (!targetId) return;
    const targetHand = game.hands.get(targetId);
    result.skippedPlayerIds = [targetId];

    if (targetHand && action.drawCards > 0) {
      result.drawnByNext = forceDrawCards(
        game.deck,
        targetHand,
        action.drawCards,
      );
    }

    // Skip the target player
    if (action.skip) {
      advanceTurn(game);
    }
  }
}

// ─── Player draws a card ───
export interface DrawResult {
  success: boolean;
  error?: string;
  card?: Card;
  canPlayDrawn: boolean; // can the drawn card be played immediately?
}

export function playerDrawCard(
  game: GameInstance,
  playerId: string,
): DrawResult {
  if (game.phase !== "playing") {
    return {
      success: false,
      error: "Not in playing phase",
      canPlayDrawn: false,
    };
  }
  if (game.playerIds[game.currentPlayerIndex] !== playerId) {
    return { success: false, error: "Not your turn", canPlayDrawn: false };
  }

  const hand = game.hands.get(playerId);
  if (!hand)
    return { success: false, error: "Player not found", canPlayDrawn: false };

  const card = drawCard(game.deck);
  if (!card)
    return { success: false, error: "No cards to draw", canPlayDrawn: false };

  hand.push(card);

  // Check if the drawn card can be played on the discard
  const drawable = game.discardTopSide
    ? canPlayCard(card, game.discardTopSide, game.activeSide, game.chosenColor)
    : false;

  if (!drawable) {
    // Can't play it — turn ends
    advanceTurn(game);
  }
  // If drawable, DON'T advance — player can choose to play it or pass

  return { success: true, card, canPlayDrawn: drawable };
}

// ─── Pass turn (after drawing a playable card but choosing not to play it) ───
export function passTurn(game: GameInstance, playerId: string): boolean {
  if (game.phase !== "playing") return false;
  if (game.playerIds[game.currentPlayerIndex] !== playerId) return false;
  advanceTurn(game);
  return true;
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
  const result: PlayResult = { success: true };

  // If this was a wild draw card, go to challenge phase
  if (game.pendingDrawAction) {
    game.phase = "awaiting_challenge";
    advanceTurn(game);
    game.challengeTarget = game.playerIds[game.currentPlayerIndex] ?? null;
    result.awaitingChallenge = true;
    return result;
  }

  // Plain wild — just advance turn
  game.phase = "playing";
  advanceTurn(game);

  return result;
}

// ─── Target accepts the draw penalty (no challenge) ───
export function acceptDraw(game: GameInstance, playerId: string): PlayResult {
  if (game.phase !== "awaiting_challenge") {
    return { success: false, error: "Not awaiting challenge" };
  }
  if (game.challengeTarget !== playerId) {
    return { success: false, error: "Not the challenge target" };
  }

  const result: PlayResult = { success: true };
  const targetHand = game.hands.get(playerId);
  if (!targetHand) return { success: false, error: "Player not found" };

  // Apply the draw penalty
  const action = resolveAction(game.pendingDrawAction ?? "wild");
  if (action.drawCards === -1) {
    // Wild Draw Color — draw until chosen color
    result.drawnByNext = drawUntilColor(
      game.deck,
      targetHand,
      game.chosenColor ?? "",
      game.activeSide,
    );
  } else if (action.drawCards > 0) {
    result.drawnByNext = forceDrawCards(
      game.deck,
      targetHand,
      action.drawCards,
    );
  }

  result.skippedPlayerIds = [playerId];

  // Clear challenge state and skip target
  clearChallengeState(game);
  game.phase = "playing";
  advanceTurn(game);

  return result;
}

// ─── Target challenges the wild draw ───
export interface ChallengeResult {
  success: boolean;
  error?: string;
  challengeSuccess: boolean; // did the challenger catch an illegal play?
  penaltyPlayerId: string;
  penaltyCards: number;
}

export function challengeDraw(
  game: GameInstance,
  playerId: string,
): ChallengeResult {
  if (game.phase !== "awaiting_challenge") {
    return {
      success: false,
      error: "Not awaiting challenge",
      challengeSuccess: false,
      penaltyPlayerId: "",
      penaltyCards: 0,
    };
  }
  if (game.challengeTarget !== playerId) {
    return {
      success: false,
      error: "Not the challenge target",
      challengeSuccess: false,
      penaltyPlayerId: "",
      penaltyCards: 0,
    };
  }

  const challengedId = game.challengedPlayerId ?? "";
  const challengedHand = game.hands.get(challengedId);
  const challengerHand = game.hands.get(playerId);

  if (!challengedHand || !challengerHand) {
    return {
      success: false,
      error: "Player not found",
      challengeSuccess: false,
      penaltyPlayerId: "",
      penaltyCards: 0,
    };
  }

  // Was the wild draw legal? We checked this BEFORE the card was removed from hand
  // (stored in game.wildDrawWasLegal during playCard)
  const challengeSuccess = !game.wildDrawWasLegal; // illegal play = challenge succeeds

  if (challengeSuccess) {
    // Challenge succeeded — challenged player takes the penalty
    const action = resolveAction(game.pendingDrawAction ?? "wild");
    let penaltyCards = 0;

    if (action.drawCards === -1) {
      const drawn = drawUntilColor(
        game.deck,
        challengedHand,
        game.chosenColor ?? "",
        game.activeSide,
      );
      penaltyCards = drawn.length;
    } else {
      forceDrawCards(game.deck, challengedHand, action.drawCards);
      penaltyCards = action.drawCards;
    }

    clearChallengeState(game);
    game.phase = "playing";
    // Challenger plays normally (don't skip them)

    return {
      success: true,
      challengeSuccess: true,
      penaltyPlayerId: challengedId,
      penaltyCards,
    };
  }

  // Challenge failed — challenger draws penalty + 2 extra
  const action = resolveAction(game.pendingDrawAction ?? "wild");
  let penaltyCards = 0;

  if (action.drawCards === -1) {
    const drawn = drawUntilColor(
      game.deck,
      challengerHand,
      game.chosenColor ?? "",
      game.activeSide,
    );
    penaltyCards = drawn.length;
  } else {
    forceDrawCards(game.deck, challengerHand, action.drawCards);
    penaltyCards = action.drawCards;
  }

  // Plus 2 extra penalty cards
  forceDrawCards(game.deck, challengerHand, GAME_RULES.CHALLENGE_PENALTY_EXTRA);
  penaltyCards += GAME_RULES.CHALLENGE_PENALTY_EXTRA;

  clearChallengeState(game);
  game.phase = "playing";
  // Challenger loses their turn — advance past them
  advanceTurn(game);

  return {
    success: true,
    challengeSuccess: false,
    penaltyPlayerId: playerId,
    penaltyCards,
  };
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

// ─── Perform the Flip mechanic ───
// Official rules: entire discard pile flips, draw pile flips, all hands flip
function performFlip(game: GameInstance): void {
  game.activeSide = game.activeSide === "light" ? "dark" : "light";

  // Official rule: entire discard pile reverses.
  // The Flip card (just played) goes to the BOTTOM,
  // the previous bottom card becomes the new top.
  game.deck.discardPile.reverse();

  // Draw pile also flips (just switch which side we read — already handled by activeSide)

  // Update the discard top to the new side of the new top card
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

// ─── Clear challenge state ───
function clearChallengeState(game: GameInstance): void {
  game.challengeTarget = null;
  game.challengedPlayerId = null;
  game.pendingDrawAction = null;
  game.wildDrawWasLegal = true;
}

// ─── Handle round win ───
function handleRoundWin(
  game: GameInstance,
  winnerId: string,
  cardPlayed: CardSide,
  action: ReturnType<typeof resolveAction>,
): PlayResult {
  // Last card action effects still apply
  const result: PlayResult = {
    success: true,
    cardPlayed,
    roundOver: true,
    winnerId,
  };

  // Apply last card effects (draw, skip, etc.) before scoring
  if (action.drawCards > 0 || action.skip || action.skipEveryone) {
    advanceTurn(game);
    const targetId = game.playerIds[game.currentPlayerIndex];
    const targetHand = targetId ? game.hands.get(targetId) : undefined;

    if (targetHand && action.drawCards > 0) {
      forceDrawCards(game.deck, targetHand, action.drawCards);
    }
  }

  // If last card is a wild draw, effects apply but no challenge
  // (round ends immediately after effects)

  // If last card is a flip, flip before scoring
  if (action.flip) {
    performFlip(game);
  }

  game.phase = "round_over";

  const roundScores = calculateRoundScores(
    game.hands,
    winnerId,
    game.activeSide,
  );
  result.roundScores = roundScores;
  const winnerPoints = totalWinnerPoints(roundScores);

  const currentScore = game.cumulativeScores.get(winnerId) ?? 0;
  game.cumulativeScores.set(winnerId, currentScore + winnerPoints);

  const gameOver =
    (game.cumulativeScores.get(winnerId) ?? 0) >= GAME_RULES.WIN_SCORE;
  if (gameOver) {
    game.phase = "game_over";
    result.gameOver = true;
  }

  return result;
}

// ─── Get the public game state ───
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
    challengeTarget: game.challengeTarget,
  };
}

// ─── Get a player's hand ───
export function getPlayerHand(game: GameInstance, playerId: string): Card[] {
  return game.hands.get(playerId) ?? [];
}
