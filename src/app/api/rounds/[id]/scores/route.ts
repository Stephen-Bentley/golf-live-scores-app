import { NextResponse } from "next/server";
import { z } from "zod";
import { FOURBALL_CAPACITY, canScoreFor } from "@/domain/fourball";
import { getCompetitionHandicap, getHandicapStrokes, getHolePoints, type Hole, type TeamScoringMode } from "@/domain/scoring";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";
import { scoreUpdateSchema } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const MAX_WRITES_PER_PLAYER_PER_MINUTE = 10;

const groupScoreSchema = scoreUpdateSchema.pick({ holeNumber: true }).extend({
  scores: z.array(scoreUpdateSchema.pick({ grossScore: true }).extend({
    playerId: z.string().min(1),
    clientVersion: z.number().int().min(0),
  })).min(1).max(FOURBALL_CAPACITY),
}).refine(({ scores }) => new Set(scores.map((s) => s.playerId)).size === scores.length);

export async function PUT(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const [host, playerSession] = await Promise.all([getHostSession(), getPlayerSession()]);
  if (!host && !playerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const input = await request.json();
    const body = input && typeof input === "object" && "scores" in input
      ? groupScoreSchema.parse(input)
      : scoreUpdateSchema.parse(input);
    const groupSave = "scores" in body;
    const updates = groupSave ? body.scores : [body];

    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({ where: { id: roundId }, include: { players: true } });
      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
      if (round.status === "closed" || round.status === "archived") {
        return NextResponse.json({ error: "This round is closed. Scores can no longer be changed." }, { status: 403 });
      }

      const actor = playerSession?.roundId === roundId
        ? round.players.find((player) => player.id === playerSession.playerId)
        : undefined;
      const isHost = host?.userId === round.hostId;
      const targets = updates.flatMap((update) => {
        const player = round.players.find((p) => p.id === (update.playerId ?? actor?.id));
        return player ? [{ ...update, player }] : [];
      });
      const scoringAsPlayer = actor && targets.length === updates.length &&
        targets.every(({ player }) => canScoreFor(actor, player));
      if (!scoringAsPlayer && (!isHost || groupSave)) {
        return NextResponse.json({ error: "You can only score for yourself or your fourball." }, { status: 403 });
      }
      if (round.teamScoring === "american_scramble") {
        return NextResponse.json({ error: "Enter a shared team score for American Scramble." }, { status: 400 });
      }
      if (!scoringAsPlayer && !updates[0].playerId) {
        return NextResponse.json({ error: "playerId required for host corrections" }, { status: 400 });
      }
      if (targets.length !== updates.length) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }

      const { holeNumber } = body;
      const snapshot = round.teeSetSnapshot as { holes: Hole[] };
      const hole = snapshot.holes.find((h) => h.number === holeNumber);
      if (!hole) return NextResponse.json({ error: "Hole is outside this round." }, { status: 400 });

      const actorId = scoringAsPlayer ? actor.id : host!.userId;
      const existingEntries = await tx.scoreEntry.findMany({
        where: { roundId, holeNumber, playerId: { in: targets.map(({ player }) => player.id) } },
      });
      const entriesByPlayer = new Map(existingEntries.map((entry) => [entry.playerId, entry]));
      const pending = targets.map((update) => ({ ...update, existing: entriesByPlayer.get(update.player.id) }));
      const conflict = pending.find(({ clientVersion, existing, grossScore }) =>
        clientVersion !== undefined &&
        clientVersion !== (existing?.version ?? 0) &&
        grossScore !== existing?.grossScore
      );
      if (conflict) {
        return NextResponse.json({
          error: "conflict",
          playerId: conflict.player.id,
          serverScore: conflict.existing?.grossScore ?? null,
          serverVersion: conflict.existing?.version ?? 0,
        }, { status: 409 });
      }

      const changed = pending.filter(({ existing, grossScore }) => existing?.grossScore !== grossScore);
      if (changed.length) {
        const groupSize = scoringAsPlayer
          ? round.players.filter((p) => canScoreFor(actor, p)).length
          : 1;
        const recentCount = await tx.scoreEvent.count({
          where: { roundId, actorId, createdAt: { gte: new Date(Date.now() - 60_000) } },
        });
        if (recentCount + changed.length > MAX_WRITES_PER_PLAYER_PER_MINUTE * groupSize) {
          return NextResponse.json({ error: "Too many score writes. Please wait and try again." }, { status: 429 });
        }
      }

      const savedScores = [];
      for (const { player, existing, grossScore } of pending) {
        const playerId = player.id;
        let entry = existing;
        if (!entry || entry.grossScore !== grossScore) {
          entry = existing
            ? await tx.scoreEntry.update({
                where: { id: existing.id },
                data: { grossScore, version: { increment: 1 }, enteredBy: actorId },
              })
            : await tx.scoreEntry.create({
                data: { roundId, playerId, holeNumber, grossScore, enteredBy: actorId },
              });
          await tx.scoreEvent.create({
            data: {
              scoreEntryId: entry.id,
              roundId,
              previousScore: existing?.grossScore ?? null,
              newScore: grossScore,
              actorId,
            },
          });
        }
        const handicap = getCompetitionHandicap(player.playingHandicap, round.teamScoring as TeamScoringMode);
        const strokes = getHandicapStrokes(handicap, hole.strokeIndex, round.holesCount);
        savedScores.push({
          id: entry.id,
          playerId,
          holeNumber,
          grossScore: entry.grossScore,
          version: entry.version,
          points: getHolePoints(round.scoringFormat, hole.par, strokes, grossScore),
        });
      }

      if (round.status === "setup") {
        await tx.round.update({ where: { id: roundId }, data: { status: "active" } });
      }
      return NextResponse.json(groupSave ? { scores: savedScores } : { score: savedScores[0] });
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid score data" }, { status: 400 });
    }
    console.error("score update error", error);
    return NextResponse.json({ error: "Failed to save score" }, { status: 500 });
  }
}
