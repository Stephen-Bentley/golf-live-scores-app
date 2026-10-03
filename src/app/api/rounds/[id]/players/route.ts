import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getHostSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  playerId: z.string().min(1),
  displayName: z.string().trim().min(1).max(40).optional(),
  playingHandicap: z.number().int().min(0).max(54).optional(),
  teamId: z.string().nullable().optional(),
});

const deleteSchema = z.object({
  playerId: z.string().min(1),
});

async function assertHost(roundId: string) {
  const host = await getHostSession();
  if (!host) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round) return { error: NextResponse.json({ error: "Not found" }, { status: 404 }) };
  if (round.hostId !== host.userId) {
    return { error: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { host, round };
}

export async function PATCH(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const auth = await assertHost(roundId);
  if ("error" in auth && auth.error) return auth.error;
  try {
    const body = patchSchema.parse(await request.json());
    if (body.displayName) {
      const clash = await prisma.player.findFirst({
        where: {
          roundId,
          displayName: body.displayName,
          NOT: { id: body.playerId },
        },
      });
      if (clash) {
        return NextResponse.json({ error: "Name already taken" }, { status: 409 });
      }
    }
    const player = await prisma.player.update({
      where: { id: body.playerId },
      data: {
        ...(body.displayName ? { displayName: body.displayName.trim() } : {}),
        ...(body.playingHandicap !== undefined
          ? { playingHandicap: body.playingHandicap }
          : {}),
        ...(body.teamId !== undefined ? { teamId: body.teamId } : {}),
      },
    });
    return NextResponse.json({ player });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const auth = await assertHost(roundId);
  if ("error" in auth && auth.error) return auth.error;
  try {
    const body = deleteSchema.parse(await request.json());
    await prisma.scoreEntry.deleteMany({ where: { playerId: body.playerId, roundId } });
    await prisma.player.delete({ where: { id: body.playerId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 });
    }
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
