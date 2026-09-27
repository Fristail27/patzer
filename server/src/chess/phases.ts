// Game-phase helpers shared by Insights and the coach's player memory, so
// both bucket a move into opening / middlegame / endgame the same way.

import type { Color, GamePhase, PhaseSplit } from '../types.js';

export function phaseFor(ply: number, split: PhaseSplit | null): GamePhase {
  if (!split) return ply <= 14 ? 'opening' : ply <= 40 ? 'middlegame' : 'endgame';
  if (split.opening && ply >= split.opening.from_ply && ply <= split.opening.to_ply) return 'opening';
  if (split.endgame && ply >= split.endgame.from_ply && ply <= split.endgame.to_ply) return 'endgame';
  return 'middlegame';
}

export function hasBackRankSignature(fen: string, userColor: Color): boolean {
  const board = fen.split(' ')[0] ?? '';
  const ranks = board.split('/');
  const backRank = userColor === 'white' ? ranks[7] : ranks[0];
  if (!backRank) return false;
  const target = userColor === 'white' ? 'K' : 'k';
  if (!backRank.includes(target)) return false;
  let nonKing = 0;
  for (const ch of backRank) {
    if (/\d/.test(ch)) continue;
    if (ch !== target && ((userColor === 'white' && ch === ch.toUpperCase()) || (userColor === 'black' && ch === ch.toLowerCase()))) {
      nonKing++;
    }
  }
  return nonKing === 0;
}
