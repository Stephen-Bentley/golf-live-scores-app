import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHostSession, getPlayerSession } from "@/lib/auth";
import {
  getHandicapStrokes,
  getStablefordPoints,
  type Hole,
} from "@/domain/scoring";
import { z } from "zod";

type Params = { params: Promise<{ id: string }> };

const MAX_WRITES_PER_MINUTE = 10;

const bodySchema = z.object({
  holeNumber: z.number().int().min(1).max(18),
  grossScore: z.number().int().min(1).max(20),
  clientVersion: z.number().int().min(0).optional(),
  mutationId: z.string().optional(),
  playerId: z.string().optional(),
});

export async function PUT(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  const playerSession = await getPlayerSession();
  if (!host && !playerSession) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { players: true },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }

    if (round.status === "closed" || round.status === "archived") {
      return NextResponse.json(
        { error: "This round is closed. Scores can no longer be changed." },
        { status: 403 }
      );
    }

    let playerId: string;
    let actorId: string;

    // Prefer player session for own scores (host may also have a player cookie)
    if (
      playerSession &&
      playerSession.roundId === roundId &&
      (!body.playerId || body.playerId === playerSession.playerId)
    ) {
      playerId = playerSession.playerId;
      actorId = playerSession.playerId;
    } else if (host && host.userId === round.hostId) {
      if (!body.playerId) {
        return NextResponse.json(
          { error: "playerId required for host corrections" },
          { status: 400 }
        );
      }
      playerId = body.playerId;
      actorId = host.userId;
    } else {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const player = round.players.find((p) => p.id === playerId);
    if (!player) {
      return NextResponse.json({ error: "Player not found" }, { status: 404 });
    }

    const oneMinuteAgo = new Date(Date.now() - 60_000);
    const recentCount = await prisma.scoreEvent.count({
      where: {
        roundId,
        actorId,
        createdAt: { gte: oneMinuteAgo },
      },
    });
    if (recentCount >= MAX_WRITES_PER_MINUTE) {
      return NextResponse.json(
        { error: "Too many score writes. Please wait and try again." },
        { status: 429 }
      );
    }

    const existing = await prisma.scoreEntry.findUnique({
      where: {
        roundId_playerId_holeNumber: {
          roundId,
          playerId,
          holeNumber: body.holeNumber,
        },
      },
    });

    if (
      existing &&
      body.clientVersion !== undefined &&
      body.clientVersion !== existing.version
    ) {
      return NextResponse.json(
        {
          error: "conflict",
          serverScore: existing.grossScore,
          serverVersion: existing.version,
        },
        { status: 409 }
      );
    }

    const previousScore = existing?.grossScore ?? null;
    const newVersion = existing ? existing.version + 1 : 1;

    const scoreEntry = await prisma.$transaction(async (tx) => {
      const entry = existing
        ? await tx.scoreEntry.update({
            where: { id: existing.id },
            data: {
              grossScore: body.grossScore,
              version: newVersion,
              enteredBy: actorId,
            },
          })
        : await tx.scoreEntry.create({
            data: {
              roundId,
              playerId,
              holeNumber: body.holeNumber,
              grossScore: body.grossScore,
              version: 1,
              enteredBy: actorId,
            },
          });

      await tx.scoreEvent.create({
        data: {
          scoreEntryId: entry.id,
          roundId,
          previousScore,
          newScore: body.grossScore,
          actorId,
        },
      });

      if (round.status === "setup") {
        await tx.round.update({
          where: { id: roundId },
          data: { status: "active" },
        });
      }

      return entry;
    });

    const snapshot = round.teeSetSnapshot as { holes: Hole[] };
    const hole = snapshot.holes.find((h) => h.number === body.holeNumber);
    let points = 0;
    if (hole) {
      const hs = getHandicapStrokes(player.playingHandicap, hole.strokeIndex);
      points = getStablefordPoints(hole.par, hs, body.grossScore);
    }

    return NextResponse.json({
      score: {
        id: scoreEntry.id,
        holeNumber: scoreEntry.holeNumber,
        grossScore: scoreEntry.grossScore,
        version: scoreEntry.version,
        points,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid score data", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("score update error", error);
    return NextResponse.json(
      { error: "Failed to save score" },
      { status: 500 }
    );
  }
}
