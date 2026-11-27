import { getHandicapStrokes, getHolePoints, type Hole, type ScoringFormat, type TeamStanding } from "./scoring";

// World Handicap System Appendix C, from lowest to highest handicap.
const allowances: Record<number, number[]> = {
  2: [35, 15],
  3: [30, 20, 10],
  4: [25, 20, 15, 10],
};

export function scrambleHandicap(handicaps: number[]): number | null {
  const weights = allowances[handicaps.length];
  if (!weights) return null;
  const ordered = [...handicaps].sort((a, b) => a - b);
  return Math.round(ordered.reduce((sum, handicap, index) => sum + handicap * weights[index], 0) / 100);
}

export type ScrambleGroup = {
  id: string;
  name: string;
  startingHole: number;
  players: { displayName: string; playingHandicap: number }[];
  scrambleScores: { holeNumber: number; grossScore: number; version: number }[];
};

export type ScrambleStanding = TeamStanding & {
  playingHandicap: number | null;
  startingHole: number;
  holesCompleted: number;
  netToPar: number;
  holeScores: {
    holeNumber: number;
    grossScore: number;
    netScore: number;
    points: number;
    version: number;
  }[];
};

export function buildScrambleStandings(groups: ScrambleGroup[], holes: Hole[], format: ScoringFormat): ScrambleStanding[] {
  const rows = groups.map((group): ScrambleStanding => {
    const playingHandicap = scrambleHandicap(group.players.map((player) => player.playingHandicap));
    const scores = new Map(group.scrambleScores.map((score) => [score.holeNumber, score]));
    let playedPar = 0;
    const holeScores = holes.flatMap((hole) => {
      const score = scores.get(hole.number);
      if (!score || playingHandicap === null) return [];
      const strokes = getHandicapStrokes(playingHandicap, hole.strokeIndex, holes.length);
      playedPar += hole.par;
      return [{
        holeNumber: hole.number,
        grossScore: score.grossScore,
        netScore: score.grossScore - strokes,
        points: getHolePoints(format, hole.par, strokes, score.grossScore),
        version: score.version,
      }];
    });
    const totalNet = holeScores.reduce((sum, score) => sum + score.netScore, 0);
    return {
      teamId: group.id,
      teamName: group.name,
      startingHole: group.startingHole,
      memberNames: group.players.map((player) => player.displayName),
      playerCount: group.players.length,
      playingHandicap,
      holesCompleted: holeScores.length,
      holeScores,
      totalGross: holeScores.reduce((sum, score) => sum + score.grossScore, 0),
      totalNet,
      netToPar: totalNet - playedPar,
      totalPoints: holeScores.reduce((sum, score) => sum + score.points, 0),
      rank: 0,
      mode: "american_scramble",
    };
  });
  const total = (row: ScrambleStanding) => format === "stroke" ? -row.netToPar : row.totalPoints;
  const completion = (row: ScrambleStanding) => Number(row.holesCompleted > 0) + Number(row.holesCompleted === holes.length);
  rows.sort((a, b) => completion(b) - completion(a) || total(b) - total(a) || a.teamName.localeCompare(b.teamName));
  rows.forEach((row, index) => {
    if (row.holesCompleted === 0) return;
    const previous = rows[index - 1];
    row.rank = previous && completion(row) === completion(previous) && total(row) === total(previous)
      ? previous.rank
      : index + 1;
  });
  return rows;
}
