import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildScrambleStandings, scrambleHandicap, type ScrambleGroup } from "@/domain/scramble";
import { generateRoundWorkbook } from "@/lib/export";
import { buildRoundResults } from "@/lib/round-results";
import { createRoundSchema } from "@/lib/types";
import { holes18, sampleExportRound } from "./fixtures";

const holes = holes18.slice(0, 9);
const team = {
  id: "a",
  name: "Team A",
  startingHole: 4,
  players: [
    { displayName: "Amy", playingHandicap: 8 },
    { displayName: "Ben", playingHandicap: 18 },
  ],
  scrambleScores: [
    { holeNumber: 4, grossScore: 5, version: 1 },
    { holeNumber: 5, grossScore: 4, version: 2 },
  ],
} satisfies ScrambleGroup;

describe("American Scramble", () => {
  it("accepts the round mode and calculates the applicable team allowances", () => {
    const round = sampleExportRound();
    expect(createRoundSchema.parse({ ...round, teamScoring: "american_scramble" }).teamScoring)
      .toBe("american_scramble");
    expect(scrambleHandicap([18, 8])).toBe(6);
    expect(scrambleHandicap([18, 8, 12])).toBe(7);
    expect(scrambleHandicap([18, 8, 12, 24])).toBe(10);
    expect(scrambleHandicap([8])).toBeNull();
  });

  it("shares one card across the team and ranks by the chosen format", () => {
    const sameScore = { ...team, id: "b", name: "Team B" };
    const lowerScore = {
      ...team,
      id: "c",
      name: "Team C",
      scrambleScores: team.scrambleScores.map((score) => ({ ...score, grossScore: 3 })),
    };
    const empty = { ...team, id: "d", name: "Team D", scrambleScores: [] };
    const stroke = buildScrambleStandings([sameScore, empty, team, lowerScore], holes, "stroke");
    expect(stroke.map(({ teamId, rank }) => [teamId, rank])).toEqual([["c", 1], ["a", 2], ["b", 2], ["d", 0]]);
    expect(stroke[1]).toMatchObject({ playingHandicap: 6, playerCount: 2, holesCompleted: 2, totalGross: 9, totalNet: 7 });
    expect(stroke[1].holeScores[1]).toMatchObject({ holeNumber: 5, version: 2, grossScore: 4, netScore: 3 });
    const points = buildScrambleStandings([team, lowerScore], holes, "stableford");
    expect(points.map(({ teamId, totalPoints }) => [teamId, totalPoints])).toEqual([["c", 8], ["a", 5]]);
  });

  it("ranks partial stroke cards by nett to par across different numbers of holes", () => {
    const teamA = { ...team, scrambleScores: [{ ...team.scrambleScores[0], grossScore: 6 }] };
    const teamB = {
      ...team,
      id: "b",
      name: "Team B",
      scrambleScores: team.scrambleScores.map((score) => ({ ...score, grossScore: 5 })),
    };
    expect(buildScrambleStandings([teamA, teamB], holes, "stroke"))
      .toMatchObject([
        { teamId: "b", rank: 1, holesCompleted: 2, totalNet: 8, netToPar: 0 },
        { teamId: "a", rank: 2, holesCompleted: 1, totalNet: 5, netToPar: 1 },
      ]);
  });

  it("exports the same nine-hole team totals and scores as the leaderboard", async () => {
    const { leaderboard, scramble } = buildRoundResults({
      scoringFormat: "stroke",
      teamScoring: "american_scramble",
      holesCount: 9,
      allianceDraw: null,
      players: [],
      scores: [],
      fourballs: [team],
    }, holes);
    expect(leaderboard).toEqual([]);
    const round = sampleExportRound({ scoringFormat: "stroke", teamScoring: "american_scramble", scramble });
    round.teeSetSnapshot.holes = holes;
    const buffer = await generateRoundWorkbook(round);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(["Team standings", "Team scorecards", "Round setup"]);
    expect(workbook.getWorksheet("Team standings")?.getRow(2).values).toEqual([, 1, "Team A", "Amy, Ben", 6, 2, 9, 7, -1]);
    expect(workbook.getWorksheet("Team scorecards")?.getRow(5).values).toEqual([, "Team A", 4, 4, 5, 4]);
  });
});
