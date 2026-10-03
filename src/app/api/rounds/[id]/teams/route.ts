import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getHostSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  const teams = await prisma.team.findMany({
    where: { roundId: id },
    include: { players: true },
  });
  return NextResponse.json({ teams });
}

export async function POST(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const round = await prisma.round.findUnique({ where: { id: roundId } });
  if (!round || round.hostId !== host.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const body = z.object({ name: z.string().trim().min(1).max(40) }).parse(await request.json());
    const team = await prisma.team.create({
      data: { roundId, name: body.name },
    });
    return NextResponse.json({ team }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Could not create team" }, { status: 400 });
  }
}
