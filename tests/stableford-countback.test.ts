import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildLeaderboard, COUNTBACK_DESCRIPTION, STABLEFORD_COUNTBACK } from "@/domain/scoring";
import { generateRoundWorkbook } from "@/lib/export";
import { createRoundSchema } from "@/lib/types";

const holes = Array.from({ length: 18 }, (_, i) => ({ number: i + 1, par: 4, strokeIndex: i + 1 }));
const players = ["Alex", "Beth", "Chris"].map((name) => ({ id: name, displayName: name, playingHandicap: 0 }));
const scores = players.flatMap(({ id }) => holes.map(({ number }) => ({
  playerId: id,
  holeNumber: number,
  grossScore: id === "Alex" ? 4 : number === 1 ? 5 : number === 18 ? 3 : 4,
  updatedAt: "2026-11-27T12:00:00Z",
})));
const settings = { stablefordCountback: STABLEFORD_COUNTBACK };
const teeSetSnapshot = { name: "White", colour: "white", holes };

describe("optional Stableford countback", () => {
  it("retains shared ranks by default and separates completed cards using numbered holes", () => {
    expect(buildLeaderboard(holes, players, scores).map(({ rank }) => rank)).toEqual([1, 1, 1]);
    const unorderedHoles = [...holes.slice(9), ...holes.slice(0, 9)];
    expect(buildLeaderboard(unorderedHoles, players, scores, settings).map(({ displayName, rank }) => [displayName, rank]))
      .toEqual([["Beth", 1], ["Chris", 1], ["Alex", 3]]);
  });

  it("uses the final hole of the first nine after tied back-nine and front-nine segment totals", () => {
    const frontNineScores = scores.filter((score) => score.playerId !== "Chris").map((score) => ({
      ...score,
      grossScore: score.playerId !== "Beth" ? 4 : score.holeNumber === 7 ? 5 : score.holeNumber === 9 ? 3 : 4,
    }));
    expect(buildLeaderboard(holes, players.slice(0, 2), frontNineScores, settings).map(({ rank, playerId }) => [rank, playerId]))
      .toEqual([[1, "Beth"], [2, "Alex"]]);
  });

  it("rejects the setting for other formats, team competitions, and nine-hole rounds", () => {
    const round = { courseName: "Test course", courseLocation: "Test city", teeSetSnapshot, ...settings };
    expect(createRoundSchema.safeParse(round).success).toBe(true);
    expect(createRoundSchema.safeParse({ ...round, scoringFormat: "modified_stableford" }).success).toBe(false);
    expect(createRoundSchema.safeParse({ ...round, teamScoring: "better_ball" }).success).toBe(false);
    expect(createRoundSchema.safeParse({ ...round, holesCount: 9 }).success).toBe(false);
  });

  it("exports the same ranks and records the published tie-break", async () => {
    const buffer = await generateRoundWorkbook({
      id: "test-round", courseName: "Test course", courseLocation: "Test city",
      teeName: "White", teeColour: "white", joinCode: "TEST", status: "closed",
      teeSetSnapshot, players, scores, ...settings,
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const leaderboard = workbook.getWorksheet("Leaderboard")!;
    expect([2, 3, 4].map((row) => [leaderboard.getCell(row, 1).value, leaderboard.getCell(row, 2).value]))
      .toEqual([[1, "Beth"], [1, "Chris"], [3, "Alex"]]);
    const setup = workbook.getWorksheet("Round setup")!;
    expect(setup.getCell("A10").value).toBe("Hole");
    expect(setup.getCell("A10").font.bold).toBe(true);
    expect(setup.getCell("B31").value).toBe(COUNTBACK_DESCRIPTION);
  });
});
