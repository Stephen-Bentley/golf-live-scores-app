/**
 * Pure scoring engine for Fairway Live.
 */

export type ScoringFormat = "stableford" | "stroke" | "modified_stableford";
export const TEAM_SCORING_MODES = [
  "aggregate", "better_ball", "better_ball_par3_both", "fourball_alliance", "mystery_better_ball_alliance",
] as const;
export type TeamScoringMode = (typeof TEAM_SCORING_MODES)[number];

export function requiresTwoPlayerPair(mode: string) {
  return mode === "better_ball_par3_both" || mode === "mystery_better_ball_alliance";
}

export function getCompetitionHandicap(playingHandicap: number, mode?: TeamScoringMode) {
  return mode === "fourball_alliance" ? Math.min(playingHandicap, 18) : playingHandicap;
}

export function getAllianceMulligans(playingHandicap: number) {
  if (playingHandicap < 19) return 0;
  if (playingHandicap < 24) return 1;
  if (playingHandicap < 29) return 2;
  return playingHandicap < 35 ? 3 : 4;
}

export type Hole = {
  number: number;
  par: number;
  strokeIndex: number;
  distance?: number | null;
};

export type ScoreEntry = {
  holeNumber: number;
  grossScore: number | null;
};

export type PlayerSummary = {
  totalPoints: number;
  holesCompleted: number;
  totalGross: number;
  totalNet: number;
  toPar: number | null;
  isComplete: boolean;
};

export function getHandicapStrokes(
  playingHandicap: number,
  strokeIndex: number,
  holesCount = 18
): number {
  if (
    !Number.isInteger(playingHandicap) ||
    playingHandicap < 0 ||
    playingHandicap > 54
  ) {
    throw new Error("playingHandicap must be an integer from 0 to 54");
  }
  if (
    !Number.isInteger(strokeIndex) ||
    strokeIndex < 1 ||
    strokeIndex > holesCount
  ) {
    throw new Error(`strokeIndex must be an integer from 1 to ${holesCount}`);
  }
  if (holesCount !== 9 && holesCount !== 18) {
    throw new Error("holesCount must be 9 or 18");
  }
  const baseStrokes = Math.floor(playingHandicap / holesCount);
  const extraStroke = strokeIndex <= playingHandicap % holesCount ? 1 : 0;
  return baseStrokes + extraStroke;
}

export function getStablefordPoints(
  par: number,
  handicapStrokes: number,
  grossScore: number | null | undefined
): number {
  if (grossScore === null || grossScore === undefined) return 0;
  const netScore = Number(grossScore) - handicapStrokes;
  return Math.max(0, 2 + par - netScore);
}

export function getModifiedStablefordPoints(
  par: number,
  handicapStrokes: number,
  grossScore: number | null | undefined
): number {
  if (grossScore === null || grossScore === undefined) return 0;
  const net = Number(grossScore) - handicapStrokes;
  const diff = net - par;
  if (diff <= -3) return 8;
  if (diff === -2) return 5;
  if (diff === -1) return 2;
  if (diff === 0) return 0;
  if (diff === 1) return -1;
  return -3;
}

export function getHolePoints(
  format: ScoringFormat,
  par: number,
  handicapStrokes: number,
  grossScore: number | null | undefined
): number {
  if (format === "stroke") return 0;
  if (format === "modified_stableford") {
    return getModifiedStablefordPoints(par, handicapStrokes, grossScore);
  }
  return getStablefordPoints(par, handicapStrokes, grossScore);
}

export function getPlayerSummary(
  holes: Hole[],
  playingHandicap: number,
  scores: ScoreEntry[],
  options: { format?: ScoringFormat; holesCount?: number; teamScoring?: TeamScoringMode } = {}
): PlayerSummary {
  const format = options.format ?? "stableford";
  const holesCount = options.holesCount ?? holes.length;
  const scoringHandicap = getCompetitionHandicap(playingHandicap, options.teamScoring);
  let totalPoints = 0;
  let holesCompleted = 0;
  let totalGross = 0;
  let totalNet = 0;
  let totalParPlayed = 0;

  for (const hole of holes) {
    const scoreEntry = scores.find((s) => s.holeNumber === hole.number);
    const grossScore = scoreEntry?.grossScore ?? null;
    if (grossScore !== null && grossScore !== undefined) {
      const handicapStrokes = getHandicapStrokes(
        scoringHandicap,
        hole.strokeIndex,
        holesCount
      );
      const gross = Number(grossScore);
      totalPoints += getHolePoints(format, hole.par, handicapStrokes, gross);
      totalGross += gross;
      totalNet += gross - handicapStrokes;
      totalParPlayed += hole.par;
      holesCompleted += 1;
    }
  }

  return {
    totalPoints,
    holesCompleted,
    totalGross,
    totalNet,
    toPar: holesCompleted > 0 ? totalNet - totalParPlayed : null,
    isComplete: holesCompleted === holes.length,
  };
}

export type LeaderboardEntry = {
  playerId: string;
  displayName: string;
  playingHandicap: number;
  teamId: string | null;
  teamName: string | null;
  totalPoints: number;
  totalGross: number;
  totalNet: number;
  toPar: number | null;
  holesCompleted: number;
  isComplete: boolean;
  rank: number;
  lastUpdate: string | null;
  lastHoleNumber: number | null;
};

export type PlayerForBoard = {
  id: string;
  displayName: string;
  playingHandicap: number;
  teamId?: string | null;
  teamName?: string | null;
};

export type StoredScore = {
  playerId: string;
  holeNumber: number;
  grossScore: number;
  updatedAt: string;
};

export function buildLeaderboard(
  holes: Hole[],
  players: PlayerForBoard[],
  scores: StoredScore[],
  options: { format?: ScoringFormat; holesCount?: number; teamScoring?: TeamScoringMode } = {}
): LeaderboardEntry[] {
  const format = options.format ?? "stableford";
  const holesCount = options.holesCount ?? holes.length;

  const entries = players.map((player) => {
    const playerScores = scores
      .filter((s) => s.playerId === player.id)
      .map((s) => ({ holeNumber: s.holeNumber, grossScore: s.grossScore }));
    const summary = getPlayerSummary(holes, player.playingHandicap, playerScores, {
      format,
      holesCount,
      teamScoring: options.teamScoring,
    });
    const playerScoreRows = scores.filter((s) => s.playerId === player.id);
    const lastUpdate =
      playerScoreRows.reduce<string | null>((latest, s) => {
        if (!latest || s.updatedAt > latest) return s.updatedAt;
        return latest;
      }, null) ?? null;
    let lastHole: number | null = null;
    if (playerScoreRows.length) {
      const latest = playerScoreRows.reduce((a, b) =>
        a.updatedAt >= b.updatedAt ? a : b
      );
      lastHole = latest.holeNumber;
    }
    return {
      playerId: player.id,
      displayName: player.displayName,
      playingHandicap: player.playingHandicap,
      teamId: player.teamId ?? null,
      teamName: player.teamName ?? null,
      totalPoints: summary.totalPoints,
      totalGross: summary.totalGross,
      totalNet: summary.totalNet,
      toPar: summary.toPar,
      holesCompleted: summary.holesCompleted,
      isComplete: summary.isComplete,
      rank: 0,
      lastUpdate,
      lastHoleNumber: lastHole,
    };
  });

  entries.sort((a, b) => {
    if (a.isComplete !== b.isComplete) return a.isComplete ? -1 : 1;
    if (format === "stroke") {
      if (a.holesCompleted === 0 && b.holesCompleted === 0) {
        return a.displayName.localeCompare(b.displayName);
      }
      if (a.totalNet !== b.totalNet) return a.totalNet - b.totalNet;
    } else if (b.totalPoints !== a.totalPoints) {
      return b.totalPoints - a.totalPoints;
    }
    return a.displayName.localeCompare(b.displayName);
  });

  let rank = 0;
  let prevKey: string | null = null;
  entries.forEach((entry, index) => {
    const key =
      format === "stroke"
        ? `${entry.isComplete}:${entry.totalNet}`
        : `${entry.isComplete}:${entry.totalPoints}`;
    if (prevKey === null || key !== prevKey) rank = index + 1;
    entry.rank = rank;
    prevKey = key;
  });

  return entries;
}

export type TeamStanding = {
  teamId: string;
  teamName: string;
  totalPoints: number;
  totalNet: number;
  totalGross: number;
  playerCount: number;
  memberNames: string[];
  rank: number;
  mode: TeamScoringMode;
};

/**
 * Aggregate (society / pairs total): sum member points and nett.
 */
export function buildTeamStandings(
  board: LeaderboardEntry[],
  format: ScoringFormat = "stableford",
  mode: TeamScoringMode = "aggregate"
): TeamStanding[] {
  return buildTeamStandingsAggregate(board, format, mode);
}

function buildTeamStandingsAggregate(
  board: LeaderboardEntry[],
  format: ScoringFormat,
  mode: TeamScoringMode
): TeamStanding[] {
  const map = new Map<
    string,
    {
      teamName: string;
      totalPoints: number;
      totalNet: number;
      totalGross: number;
      playerCount: number;
      memberNames: string[];
    }
  >();
  for (const e of board) {
    if (!e.teamId || !e.teamName) continue;
    const cur = map.get(e.teamId) || {
      teamName: e.teamName,
      totalPoints: 0,
      totalNet: 0,
      totalGross: 0,
      playerCount: 0,
      memberNames: [],
    };
    cur.totalPoints += e.totalPoints;
    cur.totalNet += e.totalNet;
    cur.totalGross += e.totalGross;
    cur.playerCount += 1;
    cur.memberNames.push(e.displayName);
    map.set(e.teamId, cur);
  }
  const list: TeamStanding[] = Array.from(map.entries()).map(([teamId, v]) => ({
    teamId,
    teamName: v.teamName,
    totalPoints: v.totalPoints,
    totalNet: v.totalNet,
    totalGross: v.totalGross,
    playerCount: v.playerCount,
    memberNames: v.memberNames.sort((a, b) => a.localeCompare(b)),
    rank: 0,
    mode,
  }));
  list.sort((a, b) =>
    format === "stroke" ? a.totalNet - b.totalNet : b.totalPoints - a.totalPoints
  );
  list.forEach((t, i) => {
    t.rank = i + 1;
  });
  return list;
}

export type TeamMemberHoleScore = {
  playerId: string;
  teamId: string;
  teamName: string;
  displayName: string;
  holeNumber: number;
  par: number;
  points: number;
  nett: number;
  gross: number;
};

/**
 * Keep the best score per hole, or the best two where the format calls for it.
 */
export function buildBetterBallStandings(
  memberHoleScores: TeamMemberHoleScore[],
  format: ScoringFormat = "stableford",
  mode: Exclude<TeamScoringMode, "aggregate"> = "better_ball"
): TeamStanding[] {
  type Acc = {
    teamName: string;
    members: Set<string>;
    memberNames: Set<string>;
    byHole: Map<number, TeamMemberHoleScore[]>;
  };
  const teams = new Map<string, Acc>();

  for (const row of memberHoleScores) {
    let acc = teams.get(row.teamId);
    if (!acc) {
      acc = {
        teamName: row.teamName,
        members: new Set(),
        memberNames: new Set(),
        byHole: new Map(),
      };
      teams.set(row.teamId, acc);
    }
    acc.members.add(row.playerId);
    acc.memberNames.add(row.displayName);
    const candidates = acc.byHole.get(row.holeNumber) ?? [];
    const count = mode === "fourball_alliance" || (mode === "better_ball_par3_both" && row.par === 3) ? 2 : 1;
    candidates.push(row);
    candidates.sort((a, b) => format === "stroke" ? a.nett - b.nett : b.points - a.points);
    acc.byHole.set(row.holeNumber, candidates.slice(0, count));
  }

  const list: TeamStanding[] = Array.from(teams.entries()).map(([teamId, acc]) => {
    let totalPoints = 0;
    let totalNet = 0;
    let totalGross = 0;
    for (const h of [...acc.byHole.values()].flat()) {
      totalPoints += h.points;
      totalNet += h.nett;
      totalGross += h.gross;
    }
    return {
      teamId,
      teamName: acc.teamName,
      totalPoints,
      totalNet,
      totalGross,
      playerCount: acc.members.size,
      memberNames: Array.from(acc.memberNames).sort((a, b) => a.localeCompare(b)),
      rank: 0,
      mode,
    };
  });

  list.sort((a, b) =>
    format === "stroke" ? a.totalNet - b.totalNet : b.totalPoints - a.totalPoints
  );
  list.forEach((t, i) => {
    t.rank = i + 1;
  });
  return list;
}

/**
 * Build hole-level member scores for better-ball calculation.
 */
export function expandMemberHoleScores(
  holes: Hole[],
  players: PlayerForBoard[],
  scores: StoredScore[],
  options: { format?: ScoringFormat; holesCount?: number; teamScoring?: TeamScoringMode } = {}
): TeamMemberHoleScore[] {
  const format = options.format ?? "stableford";
  const holesCount = options.holesCount ?? holes.length;
  const out: TeamMemberHoleScore[] = [];
  for (const player of players) {
    if (!player.teamId || !player.teamName) continue;
    for (const hole of holes) {
      const entry = scores.find(
        (s) => s.playerId === player.id && s.holeNumber === hole.number
      );
      if (!entry) continue;
      const hs = getHandicapStrokes(
        getCompetitionHandicap(player.playingHandicap, options.teamScoring),
        hole.strokeIndex,
        holesCount
      );
      const gross = entry.grossScore;
      const nett = gross - hs;
      const points = getHolePoints(format, hole.par, hs, gross);
      out.push({
        playerId: player.id,
        teamId: player.teamId,
        teamName: player.teamName,
        displayName: player.displayName,
        holeNumber: hole.number,
        par: hole.par,
        points,
        nett,
        gross,
      });
    }
  }
  return out;
}
