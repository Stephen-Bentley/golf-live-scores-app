import { prisma } from "@/lib/db";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import { acquireStream, releaseStream } from "@/lib/stream-limit";
import type { Hole } from "@/domain/scoring";
import { buildRoundResults, scrambleFourballInclude } from "@/lib/round-results";

type Params = { params: Promise<{ id: string }> };
const STREAM_MAX_AGE_MS = 5 * 60_000;

export async function GET(request: Request, { params }: Params) {
  const { id } = await params;
  const host = await getHostSession();
  const player = await getPlayerSession();
  if (!host && !player) {
    return new Response("Unauthorized", { status: 401 });
  }
  const streamKey = host ? `host:${host.userId}` : `player:${player!.playerId}`;
  if (!acquireStream(streamKey)) {
    return new Response("Too many live connections", { status: 429 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let release: (() => void) | undefined;
  let maxAgeTimeout: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      let ticking = false;
      const tick = async () => {
        if (ticking || closed) return;
        ticking = true;
        try {
        const round = await prisma.round.findUnique({
          where: { id },
          include: {
            players: { include: { team: true, fourball: true }, omit: { inviteCode: true } },
            scores: true,
            fourballs: { include: scrambleFourballInclude },
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
        const { leaderboard, teams } = buildRoundResults(round, snapshot.holes);
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
          leaderboard,
          teams,
        });
        } finally {
          ticking = false;
        }
      };

      await tick();
      const interval = setInterval(() => {
        void tick();
      }, 3000);

      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(interval);
        if (maxAgeTimeout) clearTimeout(maxAgeTimeout);
        release?.();
        try {
          controller.close();
        } catch {
          /* ignore */
        }
      };
      release = () => releaseStream(streamKey);
      maxAgeTimeout = setTimeout(onAbort, STREAM_MAX_AGE_MS);
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
