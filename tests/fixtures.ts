import type { Hole } from "@/domain/scoring";
import type { ExportRound } from "@/lib/export";

export const holes18: Hole[] = Array.from({ length: 18 }, (_, i) => ({
  number: i + 1,
  par: i % 5 === 0 ? 3 : i % 7 === 0 ? 5 : 4,
  strokeIndex: i + 1,
  distance: 300 + i * 10,
}));

export function allParsScores(playerId: string, gross = 4) {
  return holes18.map((h) => ({
    playerId,
    holeNumber: h.number,
    grossScore: gross,
    updatedAt: "2026-01-01T12:00:00.000Z",
  }));
}

export function sampleExportRound(
  overrides: Partial<ExportRound> = {}
): ExportRound {
  return {
    id: "round_test_1",
    courseName: "Test Links",
    courseLocation: "Testville",
    teeName: "White",
    teeColour: "White",
    joinCode: "ABCD12",
    status: "ready_for_export",
    teeSetSnapshot: {
      name: "White",
      colour: "White",
      holes: holes18,
    },
    players: [
      { id: "p1", displayName: "Alice", playingHandicap: 12 },
      { id: "p2", displayName: "Bob", playingHandicap: 18 },
    ],
    scores: [
      ...allParsScores("p1", 5),
      ...holes18.slice(0, 9).map((h) => ({
        playerId: "p2",
        holeNumber: h.number,
        grossScore: 4,
        updatedAt: "2026-01-01T12:30:00.000Z",
      })),
    ],
    ...overrides,
  };
}
