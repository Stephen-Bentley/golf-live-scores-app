import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import type { Hole, ScoringFormat } from "@/domain/scoring";
import { buildRoundResults, scrambleFourballInclude } from "@/lib/round-results";

type Standing = { rank: number; name: string; holesPlayed: number; result: number };
export type SpectatorBoard = {
  courseName: string;
  holesCount: number;
  format: ScoringFormat;
  teamNetToPar: boolean;
  players: Standing[];
  teams: Standing[];
};

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json({ error: "This spectator link is unavailable." }, { status: 404, headers });

export async function GET(request: Request) {
  const token = /^Bearer ([a-zA-Z0-9_-]{43})$/.exec(request.headers.get("authorization") ?? "")?.[1];
  if (!token) return unavailable();

  const round = await prisma.round.findUnique({
    where: { spectatorToken: token },
    omit: { joinCode: true, spectatorToken: true },
    include: {
      players: { select: {
        id: true, displayName: true, playingHandicap: true,
        team: { select: { id: true, name: true } },
        fourball: { select: { id: true, name: true } },
      } },
      scores: { select: { playerId: true, holeNumber: true, grossScore: true, updatedAt: true } },
      fourballs: { include: scrambleFourballInclude },
    },
  });
  if (!round) return unavailable();

  const { holes } = round.teeSetSnapshot as { holes: Hole[] };
  const { leaderboard, teams, scramble } = buildRoundResults(round, holes);
  const stroke = round.scoringFormat === "stroke";
  const groups = new Map(round.players.map((player) => [
    player.id, round.teamScoring === "fourball_alliance" ? player.fourball?.id : player.team?.id,
  ]));
  const groupHoles = new Map<string, Set<number>>();
  const holeNumbers = new Set(holes.map(({ number }) => number));
  for (const score of round.scores) {
    const group = groups.get(score.playerId);
    if (!group || !holeNumbers.has(score.holeNumber)) continue;
    const played = groupHoles.get(group) ?? new Set<number>();
    played.add(score.holeNumber);
    groupHoles.set(group, played);
  }

  const board: SpectatorBoard = {
    courseName: round.courseName,
    holesCount: round.holesCount,
    format: round.scoringFormat,
    teamNetToPar: Boolean(scramble) && stroke,
    players: leaderboard.map((entry) => ({
      rank: entry.rank, name: entry.displayName, holesPlayed: entry.holesCompleted,
      result: stroke ? entry.totalNet : entry.totalPoints,
    })),
    teams: scramble ? scramble.map((entry) => ({
      rank: entry.rank, name: entry.teamName, holesPlayed: entry.holesCompleted,
      result: stroke ? entry.netToPar ?? 0 : entry.totalPoints,
    })) : teams.map((entry) => ({
      rank: entry.rank, name: entry.teamName,
      holesPlayed: new Set(entry.teamId.split(":").flatMap((id) => [...(groupHoles.get(id) ?? [])])).size,
      result: stroke ? entry.totalNet : entry.totalPoints,
    })),
  };
  return NextResponse.json(board, { headers });
}
