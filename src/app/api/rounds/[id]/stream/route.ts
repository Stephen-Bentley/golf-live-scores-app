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

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const host = await getHostSession();
  const player = await getPlayerSession();
  if (!host && !player) {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      const tick = async () => {
        const round = await prisma.round.findUnique({
          where: { id },
          include: {
            players: { include: { team: true } },
            scores: true,
            teams: true,
          },
        });
        if (!round) {
          send({ error: "not_found" });
          return;
        }
        const isHost = Boolean(host && host.userId === round.hostId);
        const isPlayer =
          Boolean(player) &&
          player!.roundId === round.id &&
          round.players.some((p) => p.id === player!.playerId);
        if (!isHost && !isPlayer) {
          send({ error: "forbidden" });
          return;
        }
        const snapshot = round.teeSetSnapshot as { holes: Hole[] };
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
        const playerInput = round.players.map((p) => ({
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
                expandMemberHoleScores(snapshot.holes, playerInput, scoreRows, {
                  format,
                  holesCount: round.holesCount,
                }),
                format
              )
            : buildTeamStandings(board, format, "aggregate");
        send({
          type: "leaderboard",
          at: new Date().toISOString(),
          round: {
            id: round.id,
            status: round.status,
            scoringFormat: round.scoringFormat,
            holesCount: round.holesCount,
            teamScoring: round.teamScoring,
            joinCode: round.joinCode,
          },
          leaderboard: board,
          teams,
        });
      };

      await tick();
      const interval = setInterval(() => {
        void tick();
      }, 3000);

      const onAbort = () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      request.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
