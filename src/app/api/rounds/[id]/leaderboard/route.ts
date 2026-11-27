import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import { canScoreFor } from "@/domain/fourball";
import type { Hole } from "@/domain/scoring";
import { buildRoundResults, scrambleFourballInclude } from "@/lib/round-results";

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
      players: { include: { team: true, fourball: true } },
      scores: true,
      teams: true,
      fourballs: {
        orderBy: [{ startingHole: "asc" }, { teeTime: "asc" }, { name: "asc" }],
        include: scrambleFourballInclude,
      },
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  const isHost = Boolean(host && host.userId === round.hostId);
  const scoringPlayer = player?.roundId === round.id
    ? round.players.find((p) => p.id === player.playerId)
    : undefined;

  if (!isHost && !scoringPlayer) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const snapshot = round.teeSetSnapshot as {
    holes: Hole[];
    name: string;
    colour: string;
  };

  const { leaderboard, teams, scramble } = buildRoundResults(round, snapshot.holes);

  const scoresFor = (playerId: string) => round.scores
    .filter((s) => s.playerId === playerId)
    .map((s) => ({
      holeNumber: s.holeNumber,
      grossScore: s.grossScore,
      version: s.version,
    }));
  const myScores = scoringPlayer ? scoresFor(scoringPlayer.id) : [];
  const myFourball = round.fourballs.find((group) => group.id === scoringPlayer?.fourballId);
  const scoringGroup = scoringPlayer && myFourball
    ? {
        ...myFourball,
        players: round.players
          .filter((p) => canScoreFor(scoringPlayer, p))
          .map(({ id, displayName, playingHandicap }) => ({
            id, displayName, playingHandicap, scores: scoresFor(id),
          })),
      }
    : null;

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
      alliancesDrawn: Boolean(round.allianceDraw),
      courseRating: round.courseRating,
      slopeRating: round.slopeRating,
    },
    holes: snapshot.holes,
    leaderboard,
    teams,
    ...(scramble ? { scramble, myScrambleId: scoringPlayer?.fourballId ?? null } : {}),
    myScores,
    scoringGroup,
    isHost,
    ...(isHost ? {
      fourballs: round.fourballs.map(({ id, name, teeTime, startingHole }) => ({ id, name, teeTime, startingHole })),
      competitionTeams: round.teams.map(({ id, name }) => ({ id, name })),
    } : {}),
    players: round.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      playingHandicap: p.playingHandicap,
      teamId: p.teamId,
      teamName: p.team?.name ?? null,
      fourballId: p.fourballId,
      ...(isHost ? { inviteCode: p.inviteCode } : {}),
    })),
  });
}
