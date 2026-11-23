/**
 * Excel export service using ExcelJS.
 * Generates a consistent workbook from a frozen round snapshot.
 */

import ExcelJS from "exceljs";
import {
  buildLeaderboard,
  getCompetitionHandicap,
  getHandicapStrokes,
  getHolePoints,
  type Hole,
  type ScoringFormat,
  type TeamScoringMode,
  type TeamStanding,
} from "@/domain/scoring";

export type ExportPlayer = {
  id: string;
  displayName: string;
  playingHandicap: number;
};

export type ExportScore = {
  playerId: string;
  holeNumber: number;
  grossScore: number;
  updatedAt: string;
};

export type ExportRound = {
  id: string;
  courseName: string;
  courseLocation: string;
  teeName: string;
  teeColour: string;
  joinCode: string;
  status: string;
  scoringFormat?: ScoringFormat;
  teamScoring?: TeamScoringMode;
  standings?: TeamStanding[];
  teeSetSnapshot: {
    name: string;
    colour: string;
    holes: Hole[];
  };
  players: ExportPlayer[];
  scores: ExportScore[];
};

type HoleResult = {
  holeNumber: number;
  par: number;
  strokeIndex: number;
  hcpStrokes: number;
  gross: number | null;
  nett: number | null;
  points: number | null;
};

/** Prevent spreadsheet applications from treating user-controlled text as formulas. */
function safeSpreadsheetText(value: string): string {
  return /^[=+\-@]/.test(value) ? `'${value}` : value;
}

function holeResultsForPlayer(
  holes: Hole[],
  player: ExportPlayer,
  scores: ExportScore[],
  format: ScoringFormat,
  teamScoring?: TeamScoringMode
): HoleResult[] {
  const sorted = [...holes].sort((a, b) => a.number - b.number);
  return sorted.map((hole) => {
    const entry = scores.find(
      (s) => s.playerId === player.id && s.holeNumber === hole.number
    );
    const handicap = getCompetitionHandicap(player.playingHandicap, teamScoring);
    const hs = getHandicapStrokes(handicap, hole.strokeIndex, holes.length);
    if (!entry) {
      return {
        holeNumber: hole.number,
        par: hole.par,
        strokeIndex: hole.strokeIndex,
        hcpStrokes: hs,
        gross: null,
        nett: null,
        points: null,
      };
    }
    const gross = entry.grossScore;
    return {
      holeNumber: hole.number,
      par: hole.par,
      strokeIndex: hole.strokeIndex,
      hcpStrokes: hs,
      gross,
      nett: gross - hs,
      points: getHolePoints(format, hole.par, hs, gross),
    };
  });
}

export async function generateRoundWorkbook(
  round: ExportRound
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Fairway Live";
  workbook.created = new Date();

  const holes = [...round.teeSetSnapshot.holes].sort(
    (a, b) => a.number - b.number
  );
  const format = round.scoringFormat ?? "stableford";
  const board = buildLeaderboard(holes, round.players, round.scores, { format, teamScoring: round.teamScoring });

  // Order players by leaderboard rank for consistent sheets
  const playersByRank = board
    .map((e) => round.players.find((p) => p.id === e.playerId))
    .filter((p): p is ExportPlayer => Boolean(p));
  const orderedPlayers =
    playersByRank.length === round.players.length
      ? playersByRank
      : round.players;

  // --- Sheet 1: Leaderboard ---
  const lb = workbook.addWorksheet("Leaderboard");
  lb.columns = [
    { header: "Rank", key: "rank", width: 8 },
    { header: "Player", key: "player", width: 24 },
    { header: "Playing Handicap", key: "hcp", width: 16 },
    { header: "Holes Completed", key: "holes", width: 16 },
    { header: "Completion", key: "completion", width: 14 },
    { header: "Gross Total", key: "gross", width: 12 },
    { header: "Nett Total", key: "nett", width: 12 },
    { header: format === "stableford" ? "Stableford Points" : "Points", key: "points", width: 18 },
  ];
  for (const e of board) {
    lb.addRow({
      rank: e.rank,
      player: safeSpreadsheetText(e.displayName),
      hcp: e.playingHandicap,
      holes: e.holesCompleted,
      completion: e.isComplete ? "Complete" : "In progress",
      gross: e.totalGross,
      nett: e.totalNet,
      points: e.totalPoints,
    });
  }
  styleHeader(lb);
  lb.views = [{ state: "frozen", ySplit: 1 }];

  // --- Sheet 2: Hole-by-hole (wide matrix: gross, nett, points per hole) ---
  const matrix = workbook.addWorksheet("Hole by hole");
  const matrixHeader = [
    "Player",
    "Hcp",
    "Rank",
    "Gross total",
    "Nett total",
    "Points total",
  ];
  for (const { number } of holes) {
    matrixHeader.push(`H${number} Gross`, `H${number} Nett`, `H${number} Pts`);
  }
  matrix.addRow(matrixHeader);
  styleHeader(matrix);

  for (const player of orderedPlayers) {
    const entry = board.find((b) => b.playerId === player.id);
    const results = holeResultsForPlayer(holes, player, round.scores, format, round.teamScoring);
    const row: (string | number)[] = [
      safeSpreadsheetText(player.displayName),
      player.playingHandicap,
      entry?.rank ?? "",
      entry?.totalGross ?? 0,
      entry?.totalNet ?? 0,
      entry?.totalPoints ?? 0,
    ];
    for (const r of results) {
      row.push(r.gross ?? "", r.nett ?? "", r.points ?? "");
    }
    matrix.addRow(row);
  }
  matrix.columns = matrixHeader.map((h, i) => ({
    header: h,
    width: i === 0 ? 22 : i < 6 ? 12 : 10,
  }));
  matrix.views = [{ state: "frozen", xSplit: 1, ySplit: 1 }];

  // --- Sheet 3: Scorecards (readable block per player) ---
  const cards = workbook.addWorksheet("Scorecards");
  let rowNum = 1;

  for (const player of orderedPlayers) {
    const entry = board.find((b) => b.playerId === player.id);
    const results = holeResultsForPlayer(holes, player, round.scores, format, round.teamScoring);

    // Player header
    cards.getCell(rowNum, 1).value = safeSpreadsheetText(player.displayName);
    cards.getCell(rowNum, 1).font = { bold: true, size: 14 };
    cards.getCell(rowNum, 2).value = `Handicap ${player.playingHandicap}`;
    cards.getCell(rowNum, 3).value = entry
      ? `Rank ${entry.rank} · ${entry.totalPoints} pts · Gross ${entry.totalGross} · Nett ${entry.totalNet}`
      : "";
    rowNum += 1;

    // Column headers
    const headers = [
      "Hole",
      "Par",
      "SI",
      "Hcp strokes",
      "Gross",
      "Nett",
      "Points",
    ];
    headers.forEach((h, i) => {
      const cell = cards.getCell(rowNum, i + 1);
      cell.value = h;
      cell.font = { bold: true };
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF064E3B" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    });
    rowNum += 1;

    for (const r of results) {
      cards.getCell(rowNum, 1).value = r.holeNumber;
      cards.getCell(rowNum, 2).value = r.par;
      cards.getCell(rowNum, 3).value = r.strokeIndex;
      cards.getCell(rowNum, 4).value = r.hcpStrokes;
      cards.getCell(rowNum, 5).value = r.gross ?? "";
      cards.getCell(rowNum, 6).value = r.nett ?? "";
      cards.getCell(rowNum, 7).value = r.points ?? "";
      rowNum += 1;
    }

    // Totals row
    cards.getCell(rowNum, 1).value = "Total";
    cards.getCell(rowNum, 1).font = { bold: true };
    cards.getCell(rowNum, 2).value = results.reduce((s, r) => s + r.par, 0);
    cards.getCell(rowNum, 5).value =
      entry?.totalGross ??
      results.reduce((s, r) => s + (r.gross ?? 0), 0);
    cards.getCell(rowNum, 6).value =
      entry?.totalNet ?? results.reduce((s, r) => s + (r.nett ?? 0), 0);
    cards.getCell(rowNum, 7).value =
      entry?.totalPoints ??
      results.reduce((s, r) => s + (r.points ?? 0), 0);
    for (let c = 1; c <= 7; c++) {
      cards.getCell(rowNum, c).font = { bold: true };
    }
    rowNum += 2; // blank row between players
  }

  cards.columns = [
    { width: 10 },
    { width: 8 },
    { width: 8 },
    { width: 12 },
    { width: 10 },
    { width: 10 },
    { width: 10 },
  ];

  // --- Sheet 4: Round setup ---
  const setup = workbook.addWorksheet("Round setup");
  setup.addRow(["Course", safeSpreadsheetText(round.courseName)]);
  setup.addRow(["Location", safeSpreadsheetText(round.courseLocation)]);
  setup.addRow(["Tee set", safeSpreadsheetText(round.teeName)]);
  setup.addRow(["Tee colour", safeSpreadsheetText(round.teeColour)]);
  setup.addRow(["Round ID", round.id]);
  setup.addRow(["Join code", round.joinCode]);
  setup.addRow(["Status", round.status]);
  setup.addRow(["Generated at", new Date().toISOString()]);
  setup.addRow([]);
  setup.addRow(["Hole", "Par", "Stroke Index", "Distance"]);
  styleHeaderRow(setup, 10);
  for (const h of holes) {
    setup.addRow([h.number, h.par, h.strokeIndex, h.distance ?? ""]);
  }
  setup.addRow([]);
  setup.addRow(["Scoring format", format.replaceAll("_", " ")]);
  if (round.teamScoring === "fourball_alliance") {
    setup.addRow(["Scoring handicap", "Playing handicap capped at 18"]);
  }
  setup.addRow([
    "Handicap allocation",
    `floor(hcp/${holes.length}) on every hole + 1 on holes with stroke index <= hcp % ${holes.length}`,
  ]);
  setup.addRow(["Retention", "Default retention 12 months"]);
  setup.columns = [{ width: 20 }, { width: 70 }, { width: 14 }, { width: 12 }];

  if (round.standings?.length) {
    const standings = workbook.addWorksheet("Team standings");
    standings.columns = [
      { header: "Rank", key: "rank", width: 8 },
      { header: "Team", key: "team", width: 28 },
      { header: "Players", key: "players", width: 58 },
      { header: "Points", key: "points", width: 12 },
      { header: "Gross", key: "gross", width: 12 },
      { header: "Nett", key: "nett", width: 12 },
    ];
    for (const team of round.standings) {
      standings.addRow({
        rank: team.rank,
        team: safeSpreadsheetText(team.teamName),
        players: safeSpreadsheetText(team.memberNames.join(", ")),
        points: team.totalPoints,
        gross: team.totalGross,
        nett: team.totalNet,
      });
    }
    styleHeader(standings);
    standings.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function styleHeader(sheet: ExcelJS.Worksheet) {
  const row = sheet.getRow(1);
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF064E3B" },
  };
  row.commit();
}

function styleHeaderRow(sheet: ExcelJS.Worksheet, rowNumber: number) {
  const row = sheet.getRow(rowNumber);
  row.font = { bold: true };
  row.commit();
}
