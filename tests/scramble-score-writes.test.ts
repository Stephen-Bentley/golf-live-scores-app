import { expect, it, vi } from "vitest";
import { PUT } from "@/app/api/rounds/[id]/scramble-scores/route";
import { clearRateLimits } from "@/lib/rate-limit";

const { tx } = vi.hoisted(() => ({
  tx: {
    round: { findUnique: vi.fn() },
    fourball: { findFirst: vi.fn() },
    scrambleScore: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}));

vi.mock("@/lib/auth", () => ({
  getHostSession: async () => null,
  getPlayerSession: async () => ({ roundId: "round", playerId: "amy" }),
}));
vi.mock("@/lib/round-lock", () => ({
  withRoundLock: (_roundId: string, action: (db: typeof tx) => unknown) => action(tx),
}));

it("limits changed team scores while allowing a retry of the last saved score", async () => {
  clearRateLimits();
  tx.round.findUnique.mockResolvedValue({
    hostId: "host",
    status: "active",
    teamScoring: "american_scramble",
    teeSetSnapshot: { holes: [{ number: 1 }] },
  });
  tx.fourball.findFirst.mockResolvedValue({
    players: [{ id: "amy", playingHandicap: 8 }, { id: "ben", playingHandicap: 18 }],
  });
  let score: { grossScore: number; version: number } | null = null;
  tx.scrambleScore.findUnique.mockImplementation(() => score);
  tx.scrambleScore.create.mockImplementation(({ data }) => score = { grossScore: data.grossScore, version: 1 });
  tx.scrambleScore.update.mockImplementation(({ data }) => score = { grossScore: data.grossScore, version: (score?.version ?? 0) + 1 });

  const params = { params: Promise.resolve({ id: "round" }) };
  function save(grossScore: number, clientVersion: number) {
    return PUT(new Request("http://localhost", {
      method: "PUT",
      body: JSON.stringify({ holeNumber: 1, fourballId: "team", grossScore, clientVersion }),
    }), params);
  }
  for (let version = 0; version < 10; version++) {
    expect((await save(4 + version % 2, version)).status).toBe(200);
  }
  const rejected = await save(6, 10);
  expect(rejected.status).toBe(429);
  expect(Number(rejected.headers.get("Retry-After"))).toBeGreaterThan(0);
  const retry = await save(5, 9);
  expect(retry.status).toBe(200);
  expect(await retry.json()).toMatchObject({ score: { grossScore: 5, version: 10 } });
  expect(tx.scrambleScore.update).toHaveBeenCalledTimes(9);
});
