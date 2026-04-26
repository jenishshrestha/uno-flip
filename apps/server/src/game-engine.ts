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
import { canPlayCard, GAME_RULES, getActiveFace } from "@uno-flip/shared";
import { drawUntilColor, forceDrawCards, resolveAction } from "./actions.js";
import {
  createDeck,
  type DeckState,
  dealCards,
  discard,
  drawCard,
  getDiscardTop,
  shuffle,
} from "./deck.js";
import { calculateRoundScores, totalWinnerPoints } from "./scoring.js";

// ─── Dev: preset starting hands for testing ───────────────────────────
// Maps player INDEX (in join order; 0 = host) → list of light-side card
// descriptors. Set to null to use the normal random deal.
//
// Descriptor format matches RAW_DECK in shared/constants/deck.ts:
//   "wild" | "wild draw 2" | "wild draw color"
//   "<color> <value>"  e.g. "yellow 5", "blue draw 1", "red skip",
//                            "green flip", "purple skip everyone"
//
// Cards listed for one player are removed from the draw pile, so they
// won't appear in another player's hand or as the discard top.
//
// Example:
const TEST_HANDS: (string[] | null)[] | null = [
  ["wild", "wild draw 2", "flip", "yellow 5", "blue 3", "red 7", "green 2"],
  ["wild", "draw 1", "skip", "yellow 8", "blue 5", "red 2", "green 9"],
];
// const TEST_HANDS: (string[] | null)[] | null = null;

function sideValueToString(v: CardValue): string {
  if (typeof v === "number") return String(v);
  switch (v) {
    case "wild_draw_two":
      return "wild draw 2";
    case "wild_draw_color":
      return "wild draw color";
    case "draw_one":
      return "draw 1";
    case "draw_five":
      return "draw 5";
    case "skip_everyone":
      return "skip everyone";
    default:
      return v;
  }
}

function matchDescriptor(desc: string, side: CardSide): boolean {
  const d = desc.trim().toLowerCase();
  if (d === "wild") return side.color === "wild" && side.value === "wild";
  if (d === "wild draw 2")
    return side.color === "wild" && side.value === "wild_draw_two";
  if (d === "wild draw color")
    return side.color === "wild" && side.value === "wild_draw_color";
  return d === `${side.color} ${sideValueToString(side.value)}`;
}

function applyTestHands(
  game: GameInstance,
  presets: (string[] | null)[],
): void {
  for (let i = 0; i < game.playerIds.length; i++) {
    const preset = presets[i];
    if (!preset) continue;
    const playerId = game.playerIds[i];
    if (!playerId) continue;

    // Return the random deal back to the draw pile so we can pull specific
    // cards out for this player.
    const oldHand = game.hands.get(playerId) ?? [];
    game.deck.drawPile.push(...oldHand);

    const newHand: Card[] = [];
    for (const desc of preset) {
      const idx = game.deck.drawPile.findIndex((c) =>
        matchDescriptor(desc, c.light),
      );
      if (idx === -1) {
        console.warn(
          `[TEST_HANDS] no card matching "${desc}" available for player ${i}`,
        );
        continue;
      }
      const [card] = game.deck.drawPile.splice(idx, 1);
      if (card) newHand.push(card);
    }
    game.hands.set(playerId, newHand);
  }

  // Re-shuffle the remaining draw pile so flipStartingCard stays random.
  game.deck.drawPile = shuffle(game.deck.drawPile);
}

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
  connectedPlayers: Set<string>; // tracks who is currently connected
  // Set when a wild_draw_two/color is played; cleared in selectColor after
  // the draw effect is applied. Tells selectColor which draw to apply.
  pendingDrawAction: CardValue | null;
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
    connectedPlayers: new Set(players.map((p) => p.id)),
    pendingDrawAction: null,
  };

  // Deal 7 cards to each player
  game.hands = dealCards(
    game.deck,
    game.playerIds,
    GAME_RULES.CARDS_PER_PLAYER,
  );

  // Optionally override with TEST_HANDS preset for local testing.
  if (TEST_HANDS) applyTestHands(game, TEST_HANDS);

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
    game.deck.drawPile = shuffle(game.deck.drawPile);
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
  cardPlayedId?: number;
  drawnByNext?: Card[];
  drawTargetId?: string; // who drew the cards in drawnByNext
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

  const cardFace = getActiveFace(card, game.activeSide);
  const action = resolveAction(cardFace.value);

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
    return handleRoundWin(game, playerId, card.id, cardFace, action);
  }

  const result: PlayResult = {
    success: true,
    cardPlayedId: card.id,
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
    // Wild draw cards: remember which one so selectColor can apply the right
    // forced-draw effect to the next player after the color is picked.
    if (action.isWildDraw) {
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
      result.drawTargetId = targetId;
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

  // Wild draw card: apply the draw effect to the next player and skip them.
  // (No challenge mechanic — that was removed in favor of the simpler flow.)
  if (game.pendingDrawAction) {
    const action = resolveAction(game.pendingDrawAction);
    advanceTurn(game);
    const targetId = game.playerIds[game.currentPlayerIndex];
    const targetHand = targetId ? game.hands.get(targetId) : null;
    if (targetId && targetHand) {
      if (action.drawCards === -1) {
        result.drawnByNext = drawUntilColor(
          game.deck,
          targetHand,
          color,
          game.activeSide,
        );
      } else if (action.drawCards > 0) {
        result.drawnByNext = forceDrawCards(
          game.deck,
          targetHand,
          action.drawCards,
        );
      }
      result.skippedPlayerIds = [targetId];
      result.drawTargetId = targetId;
      advanceTurn(game); // skip past the target
    }
    game.pendingDrawAction = null;
    game.phase = "playing";
    return result;
  }

  // Plain wild — just advance turn
  game.phase = "playing";
  advanceTurn(game);

  return result;
}

// ─── Call UNO ───
// Player can call UNO only when they have exactly 2 cards AND at least one
// of them can legally be played on the current discard top — i.e., they're
// about to drop to 1 card on their next play.
export function callUno(game: GameInstance, playerId: string): boolean {
  const hand = game.hands.get(playerId);
  if (!hand || hand.length !== 2) return false;
  const top = game.discardTopSide;
  if (!top) return false;
  const hasPlayable = hand.some((c) =>
    canPlayCard(c, top, game.activeSide, game.chosenColor),
  );
  if (!hasPlayable) return false;
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
// We diverge from the physical-rule "reverse discard pile" for clarity:
// the just-played Flip card stays on top and only its visible side changes.
// Hands and the draw pile flip via activeSide as usual; older pile cards
// stay frozen on whichever side they were played (visualized client-side).
function performFlip(game: GameInstance): void {
  game.activeSide = game.activeSide === "light" ? "dark" : "light";

  // Top of pile is still the just-played Flip card; matching now happens
  // against its new side.
  const topCard = getDiscardTop(game.deck);
  if (topCard) {
    game.discardTopSide = getActiveFace(topCard, game.activeSide);
  }
}

// ─── Advance to the next player's turn ───
function advanceTurn(game: GameInstance): void {
  const step = game.direction === "clockwise" ? 1 : -1;
  game.currentPlayerIndex =
    (game.currentPlayerIndex + step + game.playerIds.length) %
    game.playerIds.length;
}

// ─── Handle round win ───
function handleRoundWin(
  game: GameInstance,
  winnerId: string,
  cardPlayedId: number,
  _cardFace: CardSide,
  action: ReturnType<typeof resolveAction>,
): PlayResult {
  // Last card action effects still apply
  const result: PlayResult = {
    success: true,
    cardPlayedId,
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
  const players: PublicPlayer[] = game.playerIds.map((id) => {
    const hand = game.hands.get(id) ?? [];
    return {
      id,
      name: game.playerNames.get(id) ?? "Unknown",
      cardCount: hand.length,
      cardIds: hand.map((c) => c.id),
      isUno: game.calledUno.has(id),
      connected: game.connectedPlayers.has(id),
    };
  });

  return {
    phase: game.phase,
    activeSide: game.activeSide,
    discardTop: game.discardTopSide,
    currentPlayerIndex: game.currentPlayerIndex,
    direction: game.direction,
    players,
    drawPileCardIds: game.deck.drawPile.map((c) => c.id),
    hostId,
    chosenColor: game.chosenColor,
    scores: Object.fromEntries(game.cumulativeScores),
  };
}

// ─── Get a player's hand as card IDs ───
export function getPlayerHandIds(
  game: GameInstance,
  playerId: string,
): number[] {
  return (game.hands.get(playerId) ?? []).map((c) => c.id);
}

// ─── Get deal info for all players (sent at game start) ───
export function getDealInfo(game: GameInstance): {
  deals: { playerId: string; cardIds: number[] }[];
  discardTopCardId: number;
} {
  const deals = game.playerIds.map((id) => ({
    playerId: id,
    cardIds: (game.hands.get(id) ?? []).map((c) => c.id),
  }));

  const discardTop = game.deck.discardPile[game.deck.discardPile.length - 1];
  return {
    deals,
    discardTopCardId: discardTop?.id ?? 0,
  };
}

// ─── Reconnect a player with a new socket ID ───
export function reconnectPlayer(
  game: GameInstance,
  oldId: string,
  newId: string,
): void {
  const idx = game.playerIds.indexOf(oldId);
  if (idx !== -1) game.playerIds[idx] = newId;

  const name = game.playerNames.get(oldId);
  if (name !== undefined) {
    game.playerNames.delete(oldId);
    game.playerNames.set(newId, name);
  }

  const hand = game.hands.get(oldId);
  if (hand !== undefined) {
    game.hands.delete(oldId);
    game.hands.set(newId, hand);
  }

  const score = game.cumulativeScores.get(oldId);
  if (score !== undefined) {
    game.cumulativeScores.delete(oldId);
    game.cumulativeScores.set(newId, score);
  }

  if (game.calledUno.has(oldId)) {
    game.calledUno.delete(oldId);
    game.calledUno.add(newId);
  }

  game.connectedPlayers.delete(oldId);
  game.connectedPlayers.add(newId);
}

// ─── Start the next round (keeps cumulative scores) ───
export function startNextRound(game: GameInstance): void {
  const savedScores = new Map(game.cumulativeScores);
  const savedConnected = new Set(game.connectedPlayers);
  const savedNames = new Map(game.playerNames);
  const playerIds = [...game.playerIds];

  // Re-create fresh game state
  const fresh = createGame(
    playerIds.map((id) => ({ id, name: savedNames.get(id) ?? "Unknown" })),
  );

  // Copy fresh state into the existing instance (so callers keep the same ref)
  Object.assign(game, fresh);

  // Restore cumulative scores and connection state
  game.cumulativeScores = savedScores;
  game.connectedPlayers = savedConnected;
}
