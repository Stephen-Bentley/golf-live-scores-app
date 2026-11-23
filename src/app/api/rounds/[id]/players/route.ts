import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getHostSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";
import { FOURBALL_CAPACITY } from "@/domain/fourball";
import { requiresTwoPlayerPair } from "@/domain/scoring";
import { playingHandicapSchema } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const rosterSchema = z.object({
  displayName: z.string().trim().min(1).max(40).transform((name) => name.replace(/\s+/g, " ")),
  playingHandicap: playingHandicapSchema,
  fourballId: z.string().min(1).nullable().optional(),
  teamId: z.string().min(1).nullable().optional(),
});

const patchSchema = rosterSchema.partial().extend({ playerId: z.string().min(1) });

const deleteSchema = z.object({
  playerId: z.string().min(1),
});

async function savePlayer(request: Request, { params }: Params, add: boolean) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const json = await request.json();
    const body = add ? { ...rosterSchema.parse(json), playerId: undefined } : patchSchema.parse(json);
    const { playerId, ...data } = body;
    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({ where: { id: roundId } });
      if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (round.hostId !== host.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (round.status === "closed" || round.status === "archived") {
        return NextResponse.json({ error: "This round is closed." }, { status: 403 });
      }

      const roster = await tx.player.findMany({
        where: { roundId },
        select: { id: true, displayName: true, fourballId: true, teamId: true },
      });
      const current = roster.find((p) => p.id === playerId);
      if (playerId && !current) {
        return NextResponse.json({ error: "Player not found" }, { status: 404 });
      }
      if (add && roster.length >= 100) {
        return NextResponse.json({ error: "This round is full (max 100 players)." }, { status: 409 });
      }
      if (data.fourballId && data.fourballId !== current?.fourballId) {
        const fourball = await tx.fourball.findFirst({ where: { id: data.fourballId, roundId } });
        if (!fourball) return NextResponse.json({ error: "Invalid fourball." }, { status: 400 });
        if (roster.filter((p) => p.fourballId === fourball.id).length >= FOURBALL_CAPACITY) {
          return NextResponse.json({ error: "This fourball already has four players." }, { status: 409 });
        }
      }
      if (data.teamId) {
        const team = await tx.team.findFirst({ where: { id: data.teamId, roundId } });
        if (!team) return NextResponse.json({ error: "Invalid team." }, { status: 400 });
        if (requiresTwoPlayerPair(round.teamScoring) &&
          roster.filter((p) => p.id !== playerId && p.teamId === data.teamId).length >= 2) {
          return NextResponse.json({ error: "This Betterball pair already has two players." }, { status: 409 });
        }
      }
      if (roster.some((p) =>
        p.id !== playerId && p.displayName.toLowerCase() === data.displayName?.toLowerCase()
      )) {
        return NextResponse.json({ error: "Name already taken" }, { status: 409 });
      }

      const player = playerId
        ? await tx.player.update({ where: { id: playerId }, data })
        : await tx.player.create({
            data: {
              roundId,
              displayName: data.displayName!,
              playingHandicap: data.playingHandicap!,
              teamId: data.teamId,
              fourballId: data.fourballId,
              inviteCode: randomBytes(24).toString("base64url"),
            },
          });
      return NextResponse.json({ player }, { status: add ? 201 : 200 });
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Name already taken" }, { status: 409 });
    }
    console.error("round player save error", error);
    return NextResponse.json({ error: "Could not save player." }, { status: 500 });
  }
}

export function POST(request: Request, params: Params) {
  return savePlayer(request, params, true);
}

export function PATCH(request: Request, params: Params) {
  return savePlayer(request, params, false);
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = deleteSchema.parse(await request.json());
    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({ where: { id: roundId } });
      if (!round) return NextResponse.json({ error: "Not found" }, { status: 404 });
      if (round.hostId !== host.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      const { count } = await tx.player.deleteMany({ where: { id: body.playerId, roundId } });
      if (!count) return NextResponse.json({ error: "Player not found" }, { status: 404 });
      return NextResponse.json({ ok: true });
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
