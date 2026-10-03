import { describe, it, expect } from "vitest";
import {
  getHandicapStrokes,
  getStablefordPoints,
  getPlayerSummary,
  buildLeaderboard,
} from "@/domain/scoring";
import { holes18, allParsScores } from "./fixtures";

describe("flow: handicap → nett → stableford", () => {
  it("computes nett and points for a single hole", () => {
    // Hcp 20, SI 1 → 2 strokes; gross 5 → nett 3 → pts 3 on par 4
    const hole = holes18.find((h) => h.strokeIndex === 1)!;
    const strokes = getHandicapStrokes(20, hole.strokeIndex);
    expect(strokes).toBe(2);
    const nett = 5 - strokes;
    expect(nett).toBe(3);
    expect(getStablefordPoints(hole.par, strokes, 5)).toBe(
      Math.max(0, 2 + hole.par - nett)
    );
  });

  it("includes totalGross and totalNet on player summary", () => {
    const scores = holes18.map((h) => ({
      holeNumber: h.number,
      grossScore: 5,
    }));
    const summary = getPlayerSummary(holes18, 18, scores);
    // 1 stroke every hole → nett total = 5*18 - 18 = 72
    expect(summary.totalGross).toBe(90);
    expect(summary.totalNet).toBe(72);
    expect(summary.holesCompleted).toBe(18);
    expect(summary.isComplete).toBe(true);
  });
});

describe("flow: multi-player leaderboard ranking", () => {
  it("ranks complete players above incomplete regardless of points", () => {
    const players = [
      { id: "full", displayName: "Full", playingHandicap: 0 },
      { id: "partial", displayName: "Partial", playingHandicap: 0 },
    ];
    const scores = [
      ...allParsScores("full", 5), // worse points but complete
      {
        playerId: "partial",
        holeNumber: 1,
        grossScore: 2, // eagle-ish points on one hole
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const board = buildLeaderboard(holes18, players, scores);
    expect(board[0].playerId).toBe("full");
    expect(board[0].isComplete).toBe(true);
    expect(board[1].playerId).toBe("partial");
    expect(board[1].isComplete).toBe(false);
  });

  it("exposes gross and nett totals used by the UI leaderboard", () => {
    const players = [
      { id: "a", displayName: "Alice", playingHandicap: 18 },
    ];
    const scores = allParsScores("a", 4);
    const board = buildLeaderboard(holes18, players, scores);
    expect(board).toHaveLength(1);
    expect(board[0].totalGross).toBe(72);
    // 1 stroke/hole → nett 3 * 18 = 54
    expect(board[0].totalNet).toBe(54);
    // Fixture holes mix par 3/4/5; Stableford with nett 3:
    // pts = max(0, 2 + par - 3) = par - 1 → sum(par) - 18
    const expectedPoints = holes18.reduce((sum, h) => sum + (h.par - 1), 0);
    expect(board[0].totalPoints).toBe(expectedPoints);
  });

  it("shares rank on equal points and completion", () => {
    const players = [
      { id: "a", displayName: "Ada", playingHandicap: 0 },
      { id: "b", displayName: "Bea", playingHandicap: 0 },
      { id: "c", displayName: "Cyd", playingHandicap: 0 },
    ];
    const scores = [
      ...allParsScores("a", 4),
      ...allParsScores("b", 4),
      ...allParsScores("c", 5),
    ];
    const board = buildLeaderboard(holes18, players, scores);
    expect(board[0].rank).toBe(1);
    expect(board[1].rank).toBe(1);
    expect(board[2].rank).toBe(3);
  });
});

describe("flow: incomplete scorecard progression", () => {
  it("tracks holes completed as scores are added hole by hole", () => {
    const progressive: { holeNumber: number; grossScore: number }[] = [];
    for (let i = 1; i <= 5; i++) {
      progressive.push({ holeNumber: i, grossScore: 4 });
      const summary = getPlayerSummary(holes18, 10, progressive);
      expect(summary.holesCompleted).toBe(i);
      expect(summary.isComplete).toBe(false);
    }
    for (let i = 6; i <= 18; i++) {
      progressive.push({ holeNumber: i, grossScore: 4 });
    }
    const done = getPlayerSummary(holes18, 10, progressive);
    expect(done.holesCompleted).toBe(18);
    expect(done.isComplete).toBe(true);
  });
});
