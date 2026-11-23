import { beforeEach, describe, expect, it, vi } from "vitest";
import { PUT } from "@/app/api/rounds/[id]/scores/route";
import { PATCH, POST } from "@/app/api/rounds/[id]/players/route";
import { POST as join } from "@/app/api/rounds/join/route";
import { POST as drawAlliances } from "@/app/api/rounds/[id]/alliance-draw/route";
import { inTeeOrder } from "@/domain/fourball";
import { getAllianceMulligans } from "@/domain/scoring";
import { buildRoundResults } from "@/lib/round-results";
import { holes18 } from "./fixtures";

const { tx, hostSession, playerSession, setPlayerSession } = vi.hoisted(() => ({
  tx: {
    round: { findUnique: vi.fn(), update: vi.fn() },
    fourball: { findFirst: vi.fn() },
    player: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    scoreEntry: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    scoreEvent: { count: vi.fn(), create: vi.fn() },
  },
  hostSession: vi.fn(),
  playerSession: vi.fn(),
  setPlayerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  getHostSession: hostSession,
  getPlayerSession: playerSession,
  setPlayerSessionCookie: setPlayerSession,
}));
vi.mock("@/lib/db", () => ({ prisma: tx }));
vi.mock("@/lib/round-lock", () => ({
  withRoundLock: (_id: string, action: (db: typeof tx) => Promise<unknown>) => action(tx),
}));

const params = { params: Promise.resolve({ id: "round" }) };
const roster = [
  { id: "a", displayName: "A", fourballId: "first", teamId: "pair-a", playingHandicap: 0 },
  { id: "b", displayName: "B", fourballId: "first", teamId: "pair-a", playingHandicap: 18 },
  { id: "c", displayName: "C", fourballId: "first", teamId: "pair-b", playingHandicap: 0 },
  { id: "d", displayName: "D", fourballId: "first", teamId: "pair-b", playingHandicap: 0 },
  { id: "e", displayName: "E", fourballId: "second", teamId: "pair-a", playingHandicap: 0 },
];
const round = {
  id: "round",
  hostId: "host",
  status: "active",
  holesCount: 18,
  scoringFormat: "stableford",
  teeSetSnapshot: { holes: holes18 },
  players: roster,
};

function request(method: string, body: object) {
  return new Request("http://localhost/api/rounds/round", { method, body: JSON.stringify(body) });
}

beforeEach(() => {
  vi.resetAllMocks();
  hostSession.mockResolvedValue(null);
  playerSession.mockResolvedValue({ playerId: "a", roundId: "round" });
  tx.round.findUnique.mockResolvedValue(round);
  tx.player.findMany.mockResolvedValue(roster);
  tx.fourball.findFirst.mockResolvedValue({ id: "first" });
  tx.scoreEntry.findMany.mockResolvedValue([]);
  tx.scoreEvent.count.mockResolvedValue(0);
  tx.scoreEntry.create.mockImplementation(({ data }) => ({
    ...data, id: `score-${data.playerId}`, version: 1,
  }));
});

describe("fourball scoring", () => {
  it("saves all four individual cards across both pairs and credits the scorer", async () => {
    const scores = roster.slice(0, 4).map(({ id }) => ({ playerId: id, grossScore: 4, clientVersion: 0 }));
    const response = await PUT(request("PUT", { holeNumber: 10, scores }), params);
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.scores.map((score: { playerId: string }) => score.playerId)).toEqual(["a", "b", "c", "d"]);
    expect(result.scores[1].points).toBe(result.scores[0].points + 1);
    expect(tx.scoreEvent.create).toHaveBeenCalledTimes(4);
    expect(tx.scoreEvent.create).toHaveBeenLastCalledWith({
      data: expect.objectContaining({ actorId: "a", scoreEntryId: "score-d" }),
    });
  });

  it("still accepts a player's single score when they belong to a fourball", async () => {
    playerSession.mockResolvedValue({ playerId: "b", roundId: "round" });
    const response = await PUT(request("PUT", { holeNumber: 10, grossScore: 5, clientVersion: 0 }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ score: { playerId: "b", grossScore: 5 } });
    expect(tx.scoreEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ actorId: "b" }),
    });
  });

  it("rejects an entire batch if any target is in a different fourball", async () => {
    const scores = ["a", "e"].map((playerId) => ({ playerId, grossScore: 4, clientVersion: 0 }));
    const response = await PUT(request("PUT", { holeNumber: 10, scores }), params);
    expect(response.status).toBe(403);
    expect(tx.scoreEntry.create).not.toHaveBeenCalled();
  });

  it("reports a newer self-entered score before writing any part of a group save", async () => {
    tx.scoreEntry.findMany.mockResolvedValue([{ playerId: "b", grossScore: 6, version: 1 }]);
    const scores = ["a", "b"].map((playerId) => ({ playerId, grossScore: 4, clientVersion: 0 }));
    const response = await PUT(request("PUT", { holeNumber: 10, scores }), params);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ playerId: "b", serverScore: 6, serverVersion: 1 });
    expect(tx.scoreEntry.create).not.toHaveBeenCalled();
    expect(tx.scoreEntry.update).not.toHaveBeenCalled();
  });

  it("orders a 10th-tee card through the back nine then the front nine", () => {
    expect(inTeeOrder(holes18, 10).map(({ number }) => number))
      .toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });
});

describe("fourball roster", () => {
  it("rejects moving a fifth player into a full fourball", async () => {
    hostSession.mockResolvedValue({ userId: "host" });
    const response = await PATCH(request("PATCH", { playerId: "e", fourballId: "first" }), params);
    expect(response.status).toBe(409);
    expect(tx.player.update).not.toHaveBeenCalled();
  });

  it("lets the host pre-add a player with a private link", async () => {
    hostSession.mockResolvedValue({ userId: "host" });
    tx.player.findMany.mockResolvedValue(roster.slice(0, 3));
    tx.player.create.mockImplementation(({ data }) => ({ id: "new", ...data }));
    const response = await POST(request("POST", {
      displayName: "New player", playingHandicap: 15, fourballId: "first",
    }), params);
    expect(response.status).toBe(201);
    const { player } = await response.json();
    expect(player).toMatchObject({ displayName: "New player", fourballId: "first" });
    expect(player.inviteCode).toMatch(/^[a-zA-Z0-9_-]{32}$/);
  });

  it("opens the rostered player's existing card from their private link", async () => {
    const inviteCode = "a".repeat(32);
    tx.player.findUnique.mockResolvedValue({
      ...roster[1],
      round: { ...round, joinCodeActive: true },
    });
    const response = await join(request("POST", { inviteCode }));
    expect(response.status).toBe(200);
    expect(setPlayerSession).toHaveBeenCalledWith(
      expect.objectContaining({ playerId: "b", roundId: "round" })
    );
    expect(tx.player.create).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({ player: { id: "b" } });
  });
});

describe("alliance formats", () => {
  const holes = [{ number: 1, par: 4, strokeIndex: 1 }, { number: 2, par: 4, strokeIndex: 2 }];
  const players = roster.slice(0, 4).map((player) => ({
    ...player,
    playingHandicap: 0,
    team: { id: player.teamId, name: player.teamId },
    fourball: { id: "first", name: "Fourball 1" },
  }));
  const scoresFor = (holeNumber: number, scores: number[]) => scores.map((grossScore, index) => ({
    holeNumber, grossScore, playerId: players[index].id, updatedAt: new Date(0),
  }));

  it("uses each hole's best two scores from the tee group and caps handicaps at 18", () => {
    const results = buildRoundResults({
      holesCount: 18,
      scoringFormat: "stableford",
      teamScoring: "fourball_alliance",
      allianceDraw: null,
      players: [{ ...players[0], playingHandicap: 30 }, ...players.slice(1)],
      scores: [...scoresFor(1, [4, 3, 4, 5]), ...scoresFor(2, [5, 4, 3, 2])],
    }, holes);
    expect(results.teams).toMatchObject([{ teamName: "Fourball 1", playerCount: 4, totalPoints: 13 }]);
    expect(results.leaderboard.find((player) => player.playerId === "a")?.totalPoints).toBe(5);
    expect([18, 19, 23, 24, 28, 29, 34, 35, 54].map(getAllianceMulligans))
      .toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("adds the two separately calculated Betterball totals for a mystery alliance", () => {
    const results = buildRoundResults({
      holesCount: 18,
      scoringFormat: "stableford",
      teamScoring: "mystery_better_ball_alliance",
      allianceDraw: [["pair-a", "pair-b"]],
      players,
      scores: scoresFor(1, [2, 4, 3, 4]),
    }, holes);
    expect(results.teams).toMatchObject([{ teamName: "pair-a + pair-b", playerCount: 4, totalPoints: 7 }]);
  });

  it("draws each complete Betterball pair once and preserves the draw on retry", async () => {
    const pairs = ["a", "b", "c", "d"];
    const mysteryRound = {
      ...round,
      teamScoring: "mystery_better_ball_alliance",
      players: pairs.flatMap((teamId) => [{ teamId }, { teamId }]),
    };
    hostSession.mockResolvedValue({ userId: "host" });
    tx.round.findUnique.mockResolvedValue(mysteryRound);
    expect((await drawAlliances(request("POST", {}), params)).status).toBe(201);
    const draw: string[][] = tx.round.update.mock.calls[0][0].data.allianceDraw;
    expect(draw).toHaveLength(2);
    expect(draw.flat().sort()).toEqual(pairs);
    tx.round.findUnique.mockResolvedValue({ ...mysteryRound, allianceDraw: draw });
    expect((await drawAlliances(request("POST", {}), params)).status).toBe(200);
    expect(tx.round.update).toHaveBeenCalledTimes(1);
  });
});
