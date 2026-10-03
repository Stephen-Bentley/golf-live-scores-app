import { describe, it, expect, beforeEach } from "vitest";
import {
  getHandicapStrokes,
  getModifiedStablefordPoints,
  getPlayerSummary,
  buildLeaderboard,
  buildTeamStandings,
  buildBetterBallStandings,
  expandMemberHoleScores,
  type Hole,
} from "@/domain/scoring";
import { calculatePlayingHandicap, courseParFromHoles } from "@/domain/handicap";
import { checkRateLimit, clearRateLimits } from "@/lib/rate-limit";
import {
  enqueueScore,
  loadQueue,
  removeFromQueue,
  clearQueue,
} from "@/lib/offline-queue";

const holes18: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: 4,
  strokeIndex: i + 1,
}));

const holes9: Hole[] = holes18.slice(0, 9);

describe("feature: multi-format scoring", () => {
  it("supports modified stableford bands", () => {
    expect(getModifiedStablefordPoints(4, 0, 2)).toBe(5); // eagle
    expect(getModifiedStablefordPoints(4, 0, 3)).toBe(2); // birdie
    expect(getModifiedStablefordPoints(4, 0, 4)).toBe(0); // par
    expect(getModifiedStablefordPoints(4, 0, 5)).toBe(-1); // bogey
    expect(getModifiedStablefordPoints(4, 0, 6)).toBe(-3); // double+
  });

  it("ranks stroke play by lowest nett", () => {
    const players = [
      { id: "a", displayName: "A", playingHandicap: 0 },
      { id: "b", displayName: "B", playingHandicap: 0 },
    ];
    const scores = [
      ...holes18.map((h) => ({
        playerId: "a",
        holeNumber: h.number,
        grossScore: 5,
        updatedAt: "2026-01-01T00:00:00Z",
      })),
      ...holes18.map((h) => ({
        playerId: "b",
        holeNumber: h.number,
        grossScore: 4,
        updatedAt: "2026-01-01T00:00:00Z",
      })),
    ];
    const board = buildLeaderboard(holes18, players, scores, {
      format: "stroke",
    });
    expect(board[0].playerId).toBe("b");
    expect(board[0].totalNet).toBe(72);
    expect(board[1].totalNet).toBe(90);
  });

  it("supports 9-hole handicap allocation", () => {
    expect(getHandicapStrokes(9, 1, 9)).toBe(1);
    expect(getHandicapStrokes(9, 9, 9)).toBe(1);
    expect(getHandicapStrokes(10, 1, 9)).toBe(2);
    expect(getHandicapStrokes(10, 2, 9)).toBe(1);
  });
});

describe("feature: team standings", () => {
  it("aggregates points by team (society total)", () => {
    const players = [
      {
        id: "a",
        displayName: "A",
        playingHandicap: 0,
        teamId: "t1",
        teamName: "Red",
      },
      {
        id: "b",
        displayName: "B",
        playingHandicap: 0,
        teamId: "t1",
        teamName: "Red",
      },
      {
        id: "c",
        displayName: "C",
        playingHandicap: 0,
        teamId: "t2",
        teamName: "Blue",
      },
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
        grossScore: 4,
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
    const teams = buildTeamStandings(board);
    expect(teams[0].teamName).toBe("Red");
    expect(teams[0].playerCount).toBe(2);
    expect(teams[0].totalPoints).toBeGreaterThan(teams[1].totalPoints);
  });
});

describe("feature: playing handicap from slope/rating", () => {
  it("computes WHS-style playing handicap", () => {
    const par = courseParFromHoles(holes18);
    expect(par).toBe(72);
    const hcp = calculatePlayingHandicap({
      handicapIndex: 10.4,
      slopeRating: 125,
      courseRating: 72.1,
      coursePar: 72,
    });
    expect(hcp).toBeGreaterThanOrEqual(0);
    expect(hcp).toBeLessThanOrEqual(54);
    // 10.4 * (125/113) + (72.1-72) ≈ 11.5 + 0.1 ≈ 12
    expect(hcp).toBe(12);
  });
});

describe("feature: rate limiting", () => {
  beforeEach(() => clearRateLimits());

  it("allows up to limit then blocks", () => {
    for (let i = 0; i < 3; i++) {
      expect(checkRateLimit("test:ip", 3, 60_000).allowed).toBe(true);
    }
    const blocked = checkRateLimit("test:ip", 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });
});

describe("feature: offline queue", () => {
  beforeEach(() => {
    // minimal localStorage mock for node
    const store = new Map<string, string>();
    // @ts-expect-error test mock
    global.localStorage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    };
    // @ts-expect-error test mock
    global.window = global;
  });

  it("queues and replaces score for same hole", () => {
    clearQueue("r1", "p1");
    enqueueScore("r1", "p1", { holeNumber: 3, grossScore: 4 });
    enqueueScore("r1", "p1", { holeNumber: 3, grossScore: 5 });
    const q = loadQueue("r1", "p1");
    expect(q).toHaveLength(1);
    expect(q[0].grossScore).toBe(5);
    removeFromQueue("r1", "p1", 3);
    expect(loadQueue("r1", "p1")).toHaveLength(0);
  });
});

describe("feature: activity tracking on leaderboard", () => {
  it("sets lastHoleNumber from most recent score", () => {
    const players = [{ id: "a", displayName: "A", playingHandicap: 0 }];
    const scores = [
      {
        playerId: "a",
        holeNumber: 1,
        grossScore: 4,
        updatedAt: "2026-01-01T10:00:00Z",
      },
      {
        playerId: "a",
        holeNumber: 7,
        grossScore: 5,
        updatedAt: "2026-01-01T11:00:00Z",
      },
    ];
    const board = buildLeaderboard(holes18, players, scores);
    expect(board[0].lastHoleNumber).toBe(7);
    expect(board[0].lastUpdate).toBe("2026-01-01T11:00:00Z");
  });
});

describe("feature: 9-hole summary", () => {
  it("marks complete after 9 holes on a 9-hole card", () => {
    const scores = holes9.map((h) => ({
      holeNumber: h.number,
      grossScore: 4,
    }));
    const summary = getPlayerSummary(holes9, 9, scores, {
      format: "stableford",
      holesCount: 9,
    });
    expect(summary.isComplete).toBe(true);
    expect(summary.holesCompleted).toBe(9);
  });
});


describe("feature: fourball better-ball", () => {
  it("takes the best points per hole within a team", () => {
    const players = [
      {
        id: "a",
        displayName: "A",
        playingHandicap: 0,
        teamId: "t1",
        teamName: "Pair One",
      },
      {
        id: "b",
        displayName: "B",
        playingHandicap: 0,
        teamId: "t1",
        teamName: "Pair One",
      },
    ];
    // Only hole 1: A scores par (2 pts), B scores birdie (3 pts) on par 4
    const scores = [
      {
        playerId: "a",
        holeNumber: 1,
        grossScore: 4,
        updatedAt: "2026-01-01T00:00:00Z",
      },
      {
        playerId: "b",
        holeNumber: 1,
        grossScore: 3,
        updatedAt: "2026-01-01T00:00:00Z",
      },
    ];
    const expanded = expandMemberHoleScores(holes18, players, scores);
    const standings = buildBetterBallStandings(expanded, "stableford");
    expect(standings).toHaveLength(1);
    expect(standings[0].totalPoints).toBe(3); // best of 2 and 3
    expect(standings[0].playerCount).toBe(2);
    expect(standings[0].mode).toBe("better_ball");
  });
});
