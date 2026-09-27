import { describe, it, expect } from 'vitest';
import { Chess } from 'chess.js';
import { hangingPieces, mateInOne, moveMotifs, positionFeatures } from '../src/coach/tactics.js';
import { phaseFor, hasBackRankSignature } from '../src/chess/phases.js';

// The coach's "why" is only as good as these: every sentence it says about a
// fork, a hanging piece or a mate starts here.

const at = (moves: string[]) => {
  const c = new Chess();
  for (const m of moves) c.move(m);
  return c.fen();
};
const SCHOLAR = at(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4']);
const sq = (ps: { type: string; square: string }[]) => ps.map((p) => `${p.type}${p.square}`).sort();

describe('moveMotifs', () => {
  it('sees that Nf6?? allows Qxf7# (the move from discussion #37)', () => {
    const m = moveMotifs(SCHOLAR, 'Nf6')!;
    expect(m.allowsMate).toBe('Qxf7#');
    expect(m.develops).toBe(true); // true — and exactly why it must not lead the story
  });

  it('sees that g6 stops the mate and hits the queen', () => {
    const m = moveMotifs(SCHOLAR, 'g6')!;
    expect(m.allowsMate).toBeNull();
    expect(m.stopsMate).toBe(true);
    expect(sq(m.threatens)).toEqual(['qh5']);
  });

  it('finds a knight fork of king and rook', () => {
    const m = moveMotifs('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1', 'Nc7+')!;
    expect(m.check).toBe(true);
    expect(sq(m.fork)).toEqual(['ke8', 'ra8']);
  });

  it('finds a fork of two undefended pieces without check', () => {
    // Knight to e5 hits the rook on c6 and the bishop on g4; neither
    // defends the other.
    const m = moveMotifs('4k3/8/2r5/8/6b1/5N2/8/4K3 w - - 0 1', 'Ne5')!;
    expect(sq(m.fork)).toEqual(['bg4', 'rc6']);
  });

  it('is not fooled by a "fork" of a piece that is defended and worth no more', () => {
    // Same idea, but the rook on c6 defends the bishop on g6 along the rank.
    const m = moveMotifs('4k3/8/2r3b1/8/8/5N2/8/4K3 w - - 0 1', 'Ne5')!;
    expect(m.fork).toEqual([]);
    expect(sq(m.threatens)).toEqual(['rc6']);
  });

  it('flags a piece left hanging by the move', () => {
    // The queen steps onto g4, where the c8 bishop takes it.
    const fen = at(['e4', 'd5']);
    const m = moveMotifs(fen, 'Qg4')!;
    expect(sq(m.hangs)).toEqual(['qg4']); // the c8 bishop takes it
  });

  it('flags a piece that was hanging and got rescued', () => {
    // Black knight on e5 attacked by the d4 pawn and defended by nothing.
    const fen = 'rnbqkb1r/pppppppp/8/4n3/3P4/8/PPP1PPPP/RNBQKBNR b KQkq - 0 1';
    const m = moveMotifs(fen, 'Nec6')!;
    expect(sq(m.saves)).toEqual(['ne5']);
    expect(m.hangs).toEqual([]);
  });

  it('knows castling and a capture', () => {
    expect(moveMotifs(at(['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']), 'O-O')!.castles).toBe(true);
    const cap = moveMotifs(at(['e4', 'd5']), 'exd5')!;
    expect(cap.captured).toEqual({ type: 'p', square: 'd5' });
  });

  it('knows a mating move and a mate threat', () => {
    expect(moveMotifs(at(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6']), 'Qxf7#')!.mate).toBe(true);
    // Qh5 + Bc4 already threaten Qxf7#: the bishop move completes the threat.
    expect(moveMotifs(at(['e4', 'e5', 'Qh5', 'Nc6']), 'Bc4')!.threatensMate).toBe(true);
  });

  it('returns null for an illegal move or a bad FEN', () => {
    expect(moveMotifs(SCHOLAR, 'Ke3')).toBeNull();
    expect(moveMotifs('not a fen', 'e4')).toBeNull();
  });
});

describe('hangingPieces / mateInOne', () => {
  it('counts a piece attacked by something cheaper as hanging even if defended', () => {
    // White rook on d5, defended by the e4 pawn, attacked by the c6 pawn.
    const c = new Chess('4k3/8/2p5/3R4/4P3/8/8/4K3 w - - 0 1');
    expect(sq(hangingPieces(c, 'w'))).toEqual(['rd5']);
  });

  it('does not count a defended piece attacked by an equal one', () => {
    const c = new Chess('4k3/8/2b5/3B4/4P3/8/8/4K3 w - - 0 1');
    expect(hangingPieces(c, 'w')).toEqual([]);
  });

  it('finds mate in one and nothing when there is none', () => {
    expect(mateInOne(new Chess(at(['e4', 'e5', 'Qh5', 'Nc6', 'Bc4', 'Nf6'])))).toBe('Qxf7#');
    expect(mateInOne(new Chess())).toBeNull();
  });
});

describe('positionFeatures', () => {
  it('describes the Scholar\'s-mate threat for Black', () => {
    const f = positionFeatures(SCHOLAR)!;
    expect(f.turn).toBe('b');
    expect(f.phase).toBe('opening');
    expect(f.mateThreat).toBe(true);
    expect(f.mateAvailable).toBeNull();
    expect(sq(f.undeveloped)).toEqual(['bc8', 'bf8', 'ng8']);
    expect(f.castling).toBe('available');
  });

  it('knows castled and lost-castling kings', () => {
    expect(positionFeatures('r4rk1/8/8/8/8/8/8/R4RK1 w - - 0 30')!.castling).toBe('done');
    expect(positionFeatures('r3k2r/8/8/8/8/8/8/R3K2R w - - 0 30')!.castling).toBe('lost');
  });

  it('calls a position with little material an endgame and lists no development', () => {
    const f = positionFeatures('8/5k2/8/8/8/8/5K2/R7 w - - 0 50')!;
    expect(f.phase).toBe('endgame');
    expect(f.undeveloped).toEqual([]);
  });

  it('returns null for a bad FEN', () => {
    expect(positionFeatures('nonsense')).toBeNull();
  });
});

describe('phases (shared with Insights)', () => {
  it('buckets plies without a phase split the way Insights always has', () => {
    expect(phaseFor(10, null)).toBe('opening');
    expect(phaseFor(30, null)).toBe('middlegame');
    expect(phaseFor(60, null)).toBe('endgame');
  });

  it('spots a king boxed in on its back rank', () => {
    expect(hasBackRankSignature('6k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1', 'white')).toBe(true);
    expect(hasBackRankSignature('6k1/5ppp/8/8/8/8/5PPP/5RK1 w - - 0 1', 'white')).toBe(false);
  });
});
