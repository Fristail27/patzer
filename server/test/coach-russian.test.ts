import { describe, expect, it } from "vitest";
import {
  boardPiecesNatural,
  materialBalanceNatural,
  sanToNatural,
  systemPrompt,
  verdictPhrase,
} from "../src/coach/prompts.js";

// Russian piece names decline: the mover stays in the nominative ("конь бьёт")
// while the captured piece, a promotion target and a material edge take the
// accusative ("бьёт пешку", "в ферзя", "на ладью больше"), and pawn counts
// pick one of three plural forms. These pin the grammar, not just "some
// Russian came out".

const START = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

describe("Russian coach phrasing", () => {
  it("keeps the moving piece in the nominative", () => {
    expect(sanToNatural("Nf3", START, "ru", "beginner")).toBe("конь с g1 на f3");
    expect(sanToNatural("e4", START, "ru", "beginner")).toBe("пешка на e4");
    expect(sanToNatural("Nf3", START, "ru", "kid")).toBe("лошадка с g1 на f3");
  });

  it("puts the captured piece in the accusative", () => {
    const fen = "rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 2";
    expect(sanToNatural("Nxe5", fen, "ru", "beginner")).toBe("конь бьёт пешку на e5");
    expect(sanToNatural("Nxe5", fen, "ru", "kid")).toBe("лошадка бьёт пешку на e5");
    const bishopTakes = "rnbqkbnr/pppp1ppp/8/4p3/8/2N5/PPPPPPPP/R1BQKBNR b KQkq - 1 2";
    expect(sanToNatural("Bb4", bishopTakes, "ru", "kid")).toBe("слоник с f8 на b4");
    expect(sanToNatural("Bxc3", "rnbqk1nr/pppp1ppp/8/4p3/1b6/2N5/PPPPPPPP/R1BQKBNR b KQkq - 3 3", "ru", "kid")).toBe("слоник бьёт лошадку на c3");
  });

  it("renders castling, promotion and check", () => {
    expect(sanToNatural("O-O", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "ru", "beginner")).toBe("короткая рокировка");
    expect(sanToNatural("O-O-O", "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1", "ru", "beginner")).toBe("длинная рокировка");
    expect(sanToNatural("a8=Q+", "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "ru", "beginner"))
      .toBe("пешка на a8, превращение в ферзя (шах)");
    expect(sanToNatural("a8=Q+", "4k3/P7/8/8/8/8/8/4K3 w - - 0 1", "ru", "kid"))
      .toBe("пешка на a8, превращение в королеву (шах)");
  });

  it("uses the accusative for material balance", () => {
    expect(materialBalanceNatural(0.3, "ru", "beginner")).toBe("материал равен");
    expect(materialBalanceNatural(1, "ru", "beginner")).toBe("у тебя на пешку больше");
    expect(materialBalanceNatural(2, "ru", "beginner")).toBe("у тебя на 2 пешки больше");
    expect(materialBalanceNatural(-3, "ru", "beginner")).toBe("у тебя на коня меньше");
    expect(materialBalanceNatural(-5, "ru", "beginner")).toBe("у тебя на ладью меньше");
    expect(materialBalanceNatural(9, "ru", "kid")).toBe("у тебя на королеву больше");
  });

  it("counts pawns with the right plural form", () => {
    const eight = boardPiecesNatural(START, "white", "ru", "beginner");
    expect(eight.player).toContain("8 пешек");
    expect(eight.player).toContain("король на e1");
    const three = boardPiecesNatural("4k3/8/8/8/8/8/PPP5/4K3 w - - 0 1", "white", "ru", "beginner");
    expect(three.player).toContain("3 пешки");
    const one = boardPiecesNatural("4k3/8/8/8/8/8/P7/4K3 w - - 0 1", "white", "ru", "beginner");
    expect(one.player).toContain("1 пешка");
  });

  it("has a Russian persona, rules and verdicts", () => {
    expect(systemPrompt("beginner", "ru")).toContain("Язык ответа: русский");
    expect(systemPrompt("kid", "ru")).toContain("лошадка");
    expect(systemPrompt("kid", "ru")).toContain("слоник");
    expect(verdictPhrase("blunder", "ru")).toMatch(/^зевок/);
  });
});
