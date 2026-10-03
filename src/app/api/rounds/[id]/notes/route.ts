import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getPlayerSession, getHostSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const player = await getPlayerSession();
  const host = await getHostSession();
  if (!player && !host) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const notes = await prisma.holeNote.findMany({
    where: {
      roundId,
      ...(player && player.roundId === roundId
        ? { playerId: player.playerId }
        : {}),
    },
    orderBy: { holeNumber: "asc" },
  });
  return NextResponse.json({ notes });
}

export async function PUT(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const player = await getPlayerSession();
  if (!player || player.roundId !== roundId) {
    return NextResponse.json({ error: "Player session required" }, { status: 401 });
  }
  try {
    const body = z
      .object({
        holeNumber: z.number().int().min(1).max(18),
        note: z.string().trim().max(500),
      })
      .parse(await request.json());
    const note = await prisma.holeNote.upsert({
      where: {
        roundId_playerId_holeNumber: {
          roundId,
          playerId: player.playerId,
          holeNumber: body.holeNumber,
        },
      },
      create: {
        roundId,
        playerId: player.playerId,
        holeNumber: body.holeNumber,
        note: body.note,
      },
      update: { note: body.note },
    });
    return NextResponse.json({ note });
  } catch {
    return NextResponse.json({ error: "Could not save note" }, { status: 400 });
  }
}
