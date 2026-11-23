import {
  buildLeaderboard,
  buildTeamStandings,
  buildBetterBallStandings,
  expandMemberHoleScores,
  type Hole,
  type ScoringFormat,
  type TeamScoringMode,
  type TeamStanding,
} from "@/domain/scoring";

export type AllianceDraw = [string, string][];

type ResultPlayer = {
  id: string;
  displayName: string;
  playingHandicap: number;
  team: { id: string; name: string } | null;
  fourball: { id: string; name: string } | null;
};

type RoundResultsInput = {
  holesCount: number;
  scoringFormat: ScoringFormat;
  teamScoring: string;
  allianceDraw: unknown;
  players: ResultPlayer[];
  scores: { playerId: string; holeNumber: number; grossScore: number; updatedAt: Date }[];
};

export function buildRoundResults(round: RoundResultsInput, holes: Hole[]) {
  const teamScoring = round.teamScoring as TeamScoringMode;
  const format = round.scoringFormat;
  const options = { format, holesCount: round.holesCount, teamScoring };
  const players = round.players.map((p) => {
    const group = teamScoring === "fourball_alliance" ? p.fourball : p.team;
    return {
      id: p.id,
      displayName: p.displayName,
      playingHandicap: p.playingHandicap,
      teamId: group?.id,
      teamName: group?.name,
    };
  });
  const scores = round.scores.map((s) => ({ ...s, updatedAt: s.updatedAt.toISOString() }));
  const leaderboard = buildLeaderboard(holes, players, scores, options);
  const rosterTeams = buildTeamStandings(leaderboard, format, teamScoring);
  if (teamScoring === "aggregate") return { leaderboard, teams: rosterTeams };

  const scored = buildBetterBallStandings(expandMemberHoleScores(holes, players, scores, options), format, teamScoring);
  const byId = new Map(scored.map((team) => [team.teamId, team]));
  const teams = rosterTeams.map((team) => {
    const score = byId.get(team.teamId);
    return score ? { ...score, playerCount: team.playerCount, memberNames: team.memberNames } : team;
  });
  const draw = round.allianceDraw as AllianceDraw | null;
  if (teamScoring === "mystery_better_ball_alliance" && draw) {
    const pairs = new Map(teams.map((team) => [team.teamId, team]));
    const alliances = draw.flatMap(([firstId, secondId]): TeamStanding[] => {
      const first = pairs.get(firstId);
      const second = pairs.get(secondId);
      if (!first || !second) return [];
      return [{
        teamId: `${firstId}:${secondId}`,
        teamName: `${first.teamName} + ${second.teamName}`,
        totalPoints: first.totalPoints + second.totalPoints,
        totalGross: first.totalGross + second.totalGross,
        totalNet: first.totalNet + second.totalNet,
        playerCount: first.playerCount + second.playerCount,
        memberNames: [...first.memberNames, ...second.memberNames],
        rank: 0,
        mode: teamScoring,
      }];
    });
    return { leaderboard, teams: rankTeams(alliances, format) };
  }
  return { leaderboard, teams: rankTeams(teams, format) };
}

function rankTeams(teams: TeamStanding[], format: ScoringFormat) {
  return teams
    .sort((a, b) => format === "stroke" ? a.totalNet - b.totalNet : b.totalPoints - a.totalPoints)
    .map((team, index) => ({ ...team, rank: index + 1 }));
}
