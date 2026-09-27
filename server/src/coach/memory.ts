import { db } from "../db.js";
import { SCORING_VERSION } from "../chess/classifier.js";
import { phaseFor } from "../chess/phases.js";
import { fenToEpd } from "../chess/openings.js";
import type { AnalyzedMove, Color, GamePhase, PhaseSplit } from "../types.js";
import { moveMotifs } from "./tactics.js";

// The coach's memory of a player: what keeps going wrong, what goes right,
// and where. Built from the same analysed games the Insights page reads, so
// the coach and Insights never disagree about someone's weaknesses.
//
// Mistakes are bucketed by *why* they were mistakes, using the same
// deterministic tactics the coach uses on the current move — so the coach
// can say "this is the 4th game in a row you've left a piece hanging" about
// exactly the kind of mistake on the board right now.

export type MistakeKind = "allowed_mate" | "hung_piece" | "missed_mate" | "missed_win" | "missed_tactic";

export interface PlayerMemory {
  gamesReviewed: number;
  /** Games (of gamesReviewed) with at least one mistake of each kind. */
  mistakeGames: Record<MistakeKind, number>;
  /** User accuracy per phase, averaged over the games that reached it. */
  phaseAccuracy: Partial<Record<GamePhase, number>>;
  /** Great or brilliant moves the player found. */
  greatFinds: number;
}

export const MEMORY_GAMES = 30;
const CACHE_MS = 5 * 60_000;
const cache = new Map<number, { at: number; memory: PlayerMemory }>();

/** Why a user's mistake was a mistake, from the position — or null when
 *  nothing concrete stands out (a slow positional slip). */
export function mistakeKind(m: Pick<AnalyzedMove, "fen_before" | "san" | "best_move_san" | "classification">): MistakeKind | null {
  if (!["inaccuracy", "mistake", "blunder", "miss"].includes(m.classification)) return null;
  const played = moveMotifs(m.fen_before, m.san);
  if (played?.allowsMate) return "allowed_mate";
  if (played && played.hangs.length > 0 && m.classification !== "inaccuracy") return "hung_piece";
  const best = m.best_move_san ? moveMotifs(m.fen_before, m.best_move_san) : null;
  if (best?.mate) return "missed_mate";
  if (m.classification === "miss") return "missed_win";
  if (best && (best.fork.length > 0 || best.threatensMate)) return "missed_tactic";
  return null;
}

interface Row { user_color: Color | null; moves_json: string; phase_split_json: string | null }

export function playerMemory(userId: number): PlayerMemory {
  const hit = cache.get(userId);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.memory;

  const rows = db.prepare(`
    SELECT g.user_color, a.moves_json, a.phase_split_json
    FROM analyses a JOIN games g ON g.id = a.game_id
    WHERE g.user_id = ? AND a.scoring_version >= ?
    ORDER BY g.end_time DESC, g.id DESC
    LIMIT ?
  `).all(userId, SCORING_VERSION, MEMORY_GAMES) as Row[];

  const mistakeGames: Record<MistakeKind, number> = { allowed_mate: 0, hung_piece: 0, missed_mate: 0, missed_win: 0, missed_tactic: 0 };
  const phase: Record<GamePhase, { sum: number; n: number }> = {
    opening: { sum: 0, n: 0 }, middlegame: { sum: 0, n: 0 }, endgame: { sum: 0, n: 0 },
  };
  let greatFinds = 0;

  for (const r of rows) {
    const color: Color = r.user_color ?? "white";
    let moves: AnalyzedMove[];
    try {
      moves = JSON.parse(r.moves_json) as AnalyzedMove[];
    } catch {
      continue;
    }
    const split = r.phase_split_json ? (JSON.parse(r.phase_split_json) as PhaseSplit) : null;
    for (const p of ["opening", "middlegame", "endgame"] as const) {
      const s = split?.[p];
      if (!s) continue;
      phase[p].sum += color === "white" ? s.accuracy_white : s.accuracy_black;
      phase[p].n++;
    }
    const seen = new Set<MistakeKind>();
    for (const m of moves) {
      if ((m.ply % 2 === 1 ? "white" : "black") !== color) continue;
      if (m.classification === "great" || m.classification === "brilliant") greatFinds++;
      const kind = mistakeKind(m);
      if (kind) seen.add(kind);
    }
    for (const k of seen) mistakeGames[k]++;
  }

  const phaseAccuracy: Partial<Record<GamePhase, number>> = {};
  for (const p of ["opening", "middlegame", "endgame"] as const) {
    if (phase[p].n > 0) phaseAccuracy[p] = Math.round(phase[p].sum / phase[p].n);
  }
  const memory = { gamesReviewed: rows.length, mistakeGames, phaseAccuracy, greatFinds };
  cache.set(userId, { at: Date.now(), memory });
  return memory;
}

/** Forget a player's memory — after a new analysis, and in tests. */
export function forgetPlayerMemory(userId?: number): void {
  if (userId === undefined) cache.clear();
  else cache.delete(userId);
}

/** The phase a player plays worst, when it is clearly worse than their best. */
export function weakestPhase(memory: PlayerMemory): { weak: GamePhase; weakAcc: number; best: GamePhase; bestAcc: number } | null {
  const entries = Object.entries(memory.phaseAccuracy) as [GamePhase, number][];
  if (entries.length < 2) return null;
  entries.sort((a, b) => a[1] - b[1]);
  const [weak, weakAcc] = entries[0]!;
  const [best, bestAcc] = entries[entries.length - 1]!;
  return bestAcc - weakAcc >= 8 ? { weak, weakAcc, best, bestAcc } : null;
}

/** Whether the player got this exact position wrong in the opening trainer. */
export function missedInTrainer(userId: number, fenBefore: string): { expected_san: string; misses: number } | null {
  const row = db.prepare(
    "SELECT expected_san, misses FROM opening_misses WHERE user_id = ? AND position = ? ORDER BY misses DESC LIMIT 1",
  ).get(userId, fenToEpd(fenBefore)) as { expected_san: string; misses: number } | undefined;
  return row ?? null;
}
