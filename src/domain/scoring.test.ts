import { describe, it, expect } from "vitest";
import {
  getHandicapStrokes,
  getStablefordPoints,
  getPlayerSummary,
  buildLeaderboard,
  type Hole,
} from "./scoring";

const holes18: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

describe("getHandicapStrokes", () => {
  it("assigns 0 strokes for handicap 0", () => {
    expect(getHandicapStrokes(0, 1)).toBe(0);
    expect(getHandicapStrokes(0, 18)).toBe(0);
  });

  it("assigns 1 stroke on every hole for handicap 18", () => {
    expect(getHandicapStrokes(18, 1)).toBe(1);
    expect(getHandicapStrokes(18, 18)).toBe(1);
  });

  it("assigns 2 strokes on SI 1-2 and 1 elsewhere for handicap 20", () => {
    expect(getHandicapStrokes(20, 1)).toBe(2);
    expect(getHandicapStrokes(20, 2)).toBe(2);
    expect(getHandicapStrokes(20, 3)).toBe(1);
    expect(getHandicapStrokes(20, 18)).toBe(1);
  });

  it("handles handicap 36 (2 on every hole)", () => {
    expect(getHandicapStrokes(36, 1)).toBe(2);
    expect(getHandicapStrokes(36, 18)).toBe(2);
  });

  it("handles handicap 54 (3 on every hole)", () => {
    expect(getHandicapStrokes(54, 1)).toBe(3);
    expect(getHandicapStrokes(54, 18)).toBe(3);
  });

  it("rejects invalid inputs", () => {
    expect(() => getHandicapStrokes(-1, 1)).toThrow();
    expect(() => getHandicapStrokes(55, 1)).toThrow();
    expect(() => getHandicapStrokes(10, 0)).toThrow();
    expect(() => getHandicapStrokes(10, 19)).toThrow();
  });
});

describe("getStablefordPoints", () => {
  it("awards 2 points for net par", () => {
    // AC-3: par 4, 1 stroke, gross 5 → net 4 → 2 pts
    expect(getStablefordPoints(4, 1, 5)).toBe(2);
  });

  it("covers score bands", () => {
    expect(getStablefordPoints(4, 0, 4)).toBe(2); // par
    expect(getStablefordPoints(4, 0, 3)).toBe(3); // birdie
    expect(getStablefordPoints(4, 0, 2)).toBe(4); // eagle
    expect(getStablefordPoints(4, 0, 1)).toBe(5);
    expect(getStablefordPoints(4, 0, 5)).toBe(1); // bogey
    expect(getStablefordPoints(4, 0, 6)).toBe(0); // double+
    expect(getStablefordPoints(4, 0, 10)).toBe(0);
  });

  it("returns 0 for missing scores", () => {
    expect(getStablefordPoints(4, 1, null)).toBe(0);
    expect(getStablefordPoints(4, 1, undefined)).toBe(0);
  });
});

describe("getPlayerSummary", () => {
  it("sums 54 points for hcp 18 all pars", () => {
    const scores = holes18.map((h) => ({
      holeNumber: h.number,
      grossScore: 4,
    }));
    const summary = getPlayerSummary(holes18, 18, scores);
    expect(summary.totalPoints).toBe(54);
    expect(summary.totalGross).toBe(72);
    expect(summary.totalNet).toBe(54); // 4-1 per hole
    expect(summary.holesCompleted).toBe(18);
    expect(summary.isComplete).toBe(true);
    expect(summary.toPar).not.toBeNull();
  });

  it("sums 56 points for hcp 20 all pars", () => {
    const scores = holes18.map((h) => ({
      holeNumber: h.number,
      grossScore: 4,
    }));
    const summary = getPlayerSummary(holes18, 20, scores);
    // SI 1-2: 2 strokes → net 2 → 4 pts each = 8
    // SI 3-18: 1 stroke → net 3 → 3 pts each = 48
    expect(summary.totalPoints).toBe(56);
  });

  it("marks incomplete when holes missing", () => {
    const scores = holes18.slice(1).map((h) => ({
      holeNumber: h.number,
      grossScore: 4,
    }));
    const summary = getPlayerSummary(holes18, 18, scores);
    expect(summary.holesCompleted).toBe(17);
    expect(summary.isComplete).toBe(false);
    expect(summary.totalPoints).toBe(51);
  });
});

describe("buildLeaderboard", () => {
  it("ranks by points descending with shared ties", () => {
    const players = [
      { id: "a", displayName: "Alice", playingHandicap: 0 },
      { id: "b", displayName: "Bob", playingHandicap: 0 },
      { id: "c", displayName: "Carol", playingHandicap: 0 },
    ];
    const scores = [
      ...holes18.map((h) => ({
        playerId: "a",
        holeNumber: h.number,
        grossScore: 3,
        updatedAt: "2026-01-01T00:00:00Z",
      })),
      ...holes18.map((h) => ({
        playerId: "b",
        holeNumber: h.number,
        grossScore: 3,
        updatedAt: "2026-01-01T00:00:00Z",
      })),
      ...holes18.map((h) => ({
        playerId: "c",
        holeNumber: h.number,
        grossScore: 4,
        updatedAt: "2026-01-01T00:00:00Z",
      })),
    ];
    const board = buildLeaderboard(holes18, players, scores);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(1); // tie
    expect(board[2].rank).toBe(3);
    expect(board[2].displayName).toBe("Carol");
  });
});
