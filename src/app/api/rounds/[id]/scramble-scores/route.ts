import { NextResponse } from "next/server";
import { z } from "zod";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";
import { checkRateLimit } from "@/lib/rate-limit";
import { scoreUpdateSchema, type TeeSetSnapshot } from "@/lib/types";
import { scrambleHandicap } from "@/domain/scramble";

type Params = { params: Promise<{ id: string }> };

const bodySchema = scoreUpdateSchema.pick({ holeNumber: true, grossScore: true }).extend({
  fourballId: z.string().min(1),
  clientVersion: z.number().int().min(0),
});

export async function PUT(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const [host, player] = await Promise.all([getHostSession(), getPlayerSession()]);
  if (!host && !player) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { fourballId, holeNumber, grossScore, clientVersion } = bodySchema.parse(await request.json());
    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({ where: { id: roundId } });
      if (!round) return NextResponse.json({ error: "Round not found." }, { status: 404 });
      const group = await tx.fourball.findFirst({
        where: { id: fourballId, roundId },
        include: { players: { select: { id: true, playingHandicap: true } } },
      });
      const isHost = host?.userId === round.hostId;
      const isMember = player?.roundId === roundId && group?.players.some(({ id }) => id === player.playerId);
      if (!isHost && !isMember) {
        return NextResponse.json({ error: "You can only score for your scramble team." }, { status: 403 });
      }
      if (round.status === "closed" || round.status === "archived") {
        return NextResponse.json({ error: "This round is closed." }, { status: 403 });
      }
      if (!group || round.teamScoring !== "american_scramble") {
        return NextResponse.json({ error: "Invalid scramble team." }, { status: 400 });
      }
      if (scrambleHandicap(group.players.map(({ playingHandicap }) => playingHandicap)) === null) {
        return NextResponse.json({ error: "Assign two to four players to the team before scoring." }, { status: 400 });
      }
      const { holes } = round.teeSetSnapshot as TeeSetSnapshot;
      if (!holes.some((hole) => hole.number === holeNumber)) {
        return NextResponse.json({ error: "Hole is outside this round." }, { status: 400 });
      }

      const where = { fourballId_holeNumber: { fourballId, holeNumber } };
      const existing = await tx.scrambleScore.findUnique({ where });
      if (existing?.grossScore === grossScore) return NextResponse.json({ score: existing });
      if ((existing?.version ?? 0) !== clientVersion) {
        return NextResponse.json({
          error: "Another scorer updated this hole. Review the saved score and try again.",
          score: existing,
        }, { status: 409 });
      }
      const enteredBy = isHost ? host!.userId : player!.playerId;
      const limit = checkRateLimit(`scramble-score:${roundId}:${enteredBy}`, 10, 60_000);
      if (!limit.allowed) {
        return NextResponse.json(
          { error: "Too many score writes. Please wait and try again." },
          { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
        );
      }
      const score = existing
        ? await tx.scrambleScore.update({ where, data: { grossScore, enteredBy, version: { increment: 1 } } })
        : await tx.scrambleScore.create({ data: { fourballId, holeNumber, grossScore, enteredBy } });
      if (round.status === "setup") {
        await tx.round.update({ where: { id: roundId }, data: { status: "active" } });
      }
      return NextResponse.json({ score });
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid scramble score." }, { status: 400 });
    }
    console.error("scramble score update error", error);
    return NextResponse.json({ error: "Could not save the team score." }, { status: 500 });
  }
}
