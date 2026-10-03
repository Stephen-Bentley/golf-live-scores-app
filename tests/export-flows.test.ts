import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { generateRoundWorkbook } from "@/lib/export";
import { sampleExportRound, holes18 } from "./fixtures";

describe("flow: excel export", () => {
  it("produces a workbook with leaderboard, hole-by-hole, scorecards, and setup", async () => {
    const buffer = await generateRoundWorkbook(sampleExportRound());
    expect(buffer.byteLength).toBeGreaterThan(1000);

    const workbook = new ExcelJS.Workbook();
    // exceljs accepts Buffer / Uint8Array
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const names = workbook.worksheets.map((ws) => ws.name);
    expect(names).toEqual([
      "Leaderboard",
      "Hole by hole",
      "Scorecards",
      "Round setup",
    ]);
  });

  it("includes gross, nett, and points columns on the leaderboard", async () => {
    const buffer = await generateRoundWorkbook(sampleExportRound());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const lb = workbook.getWorksheet("Leaderboard");
    expect(lb).toBeTruthy();
    const header = lb!.getRow(1).values as (string | number | undefined)[];
    const headerText = header.filter(Boolean).map(String);
    expect(headerText).toContain("Gross Total");
    expect(headerText).toContain("Nett Total");
    expect(headerText).toContain("Stableford Points");

    // Two players → header + 2 data rows
    expect(lb!.rowCount).toBeGreaterThanOrEqual(3);
  });

  it("includes per-hole gross, nett, and points for each player", async () => {
    const buffer = await generateRoundWorkbook(sampleExportRound());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const matrix = workbook.getWorksheet("Hole by hole");
    expect(matrix).toBeTruthy();
    const header = (matrix!.getRow(1).values as unknown[]).filter(Boolean).map(String);

    expect(header).toContain("H1 Gross");
    expect(header).toContain("H1 Nett");
    expect(header).toContain("H1 Pts");
    expect(header).toContain("H18 Gross");
    expect(header).toContain("H18 Pts");

    // Alice full card + Bob 9 holes
    const aliceRow = matrix!.getRow(2);
    const aliceName = aliceRow.getCell(1).value;
    expect(aliceName).toBe("Alice");

    // H1 Gross is after Rank + totals (columns: Player, Hcp, Rank, Gross total, Nett total, Points total, then H1 Gross...)
    const h1Gross = aliceRow.getCell(7).value;
    expect(h1Gross).toBe(5);
  });

  it("writes scorecard blocks with hole-level gross, nett, and points", async () => {
    const buffer = await generateRoundWorkbook(sampleExportRound());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const cards = workbook.getWorksheet("Scorecards");
    expect(cards).toBeTruthy();

    // Find Alice header
    let foundAlice = false;
    let foundHoleHeader = false;
    let foundTotal = false;
    cards!.eachRow((row) => {
      const v = row.getCell(1).value;
      if (v === "Alice") foundAlice = true;
      if (v === "Hole") foundHoleHeader = true;
      if (v === "Total") foundTotal = true;
    });
    expect(foundAlice).toBe(true);
    expect(foundHoleHeader).toBe(true);
    expect(foundTotal).toBe(true);
  });

  it("records course and hole setup for audit", async () => {
    const buffer = await generateRoundWorkbook(sampleExportRound());
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

    const setup = workbook.getWorksheet("Round setup");
    expect(setup).toBeTruthy();
    const first = setup!.getRow(1).getCell(2).value;
    expect(first).toBe("Test Links");
    expect(holes18).toHaveLength(18);
  });
});
