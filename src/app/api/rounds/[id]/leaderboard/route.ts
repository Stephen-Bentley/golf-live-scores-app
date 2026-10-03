import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import {
  buildLeaderboard,
  buildTeamStandings,
  buildBetterBallStandings,
  expandMemberHoleScores,
  type Hole,
  type ScoringFormat,
  type TeamScoringMode,
} from "@/domain/scoring";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const host = await getHostSession();
  const player = await getPlayerSession();
  if (!host && !player) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const round = await prisma.round.findUnique({
    where: { id },
    include: {
      players: { include: { team: true } },
      scores: true,
      teams: true,
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const isHost = Boolean(host && host.userId === round.hostId);
  const isPlayer =
    Boolean(player) &&
    player!.roundId === round.id &&
    round.players.some((p) => p.id === player!.playerId);

  if (!isHost && !isPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = round.teeSetSnapshot as {
    holes: Hole[];
    name: string;
    colour: string;
  };

  const format = round.scoringFormat as ScoringFormat;
  const board = buildLeaderboard(
    snapshot.holes,
    round.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      playingHandicap: p.playingHandicap,
      teamId: p.teamId,
      teamName: p.team?.name ?? null,
    })),
    round.scores.map((s) => ({
      playerId: s.playerId,
      holeNumber: s.holeNumber,
      grossScore: s.grossScore,
      updatedAt: s.updatedAt.toISOString(),
    })),
    { format, holesCount: round.holesCount }
  );
  const teamMode = (round.teamScoring || "aggregate") as TeamScoringMode;
  const playerBoardInput = round.players.map((p) => ({
    id: p.id,
    displayName: p.displayName,
    playingHandicap: p.playingHandicap,
    teamId: p.teamId,
    teamName: p.team?.name ?? null,
  }));
  const scoreRows = round.scores.map((s) => ({
    playerId: s.playerId,
    holeNumber: s.holeNumber,
    grossScore: s.grossScore,
    updatedAt: s.updatedAt.toISOString(),
  }));
  const teams =
    teamMode === "better_ball"
      ? buildBetterBallStandings(
          expandMemberHoleScores(snapshot.holes, playerBoardInput, scoreRows, {
            format,
            holesCount: round.holesCount,
          }),
          format
        )
      : buildTeamStandings(board, format, "aggregate");

  const myScores = player
    ? round.scores
        .filter((s) => s.playerId === player.playerId)
        .map((s) => ({
          holeNumber: s.holeNumber,
          grossScore: s.grossScore,
          version: s.version,
        }))
    : [];

  return NextResponse.json({
    round: {
      id: round.id,
      courseName: round.courseName,
      courseLocation: round.courseLocation,
      teeName: round.teeName,
      status: round.status,
      joinCode: round.joinCode,
      joinCodeActive: round.joinCodeActive,
      scoringFormat: round.scoringFormat,
      holesCount: round.holesCount,
      teamScoring: round.teamScoring,
      courseRating: round.courseRating,
      slopeRating: round.slopeRating,
    },
    holes: snapshot.holes,
    leaderboard: board,
    teams,
    myScores,
    isHost,
    players: round.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      playingHandicap: p.playingHandicap,
      teamId: p.teamId,
      teamName: p.team?.name ?? null,
    })),
  });
}
