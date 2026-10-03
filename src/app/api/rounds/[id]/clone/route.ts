import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHostSession, makeJoinCode } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const source = await prisma.round.findUnique({ where: { id } });
  if (!source || source.hostId !== host.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let joinCode = makeJoinCode();
  for (let i = 0; i < 5; i++) {
    const existing = await prisma.round.findUnique({ where: { joinCode } });
    if (!existing) break;
    joinCode = makeJoinCode();
  }
  const round = await prisma.round.create({
    data: {
      hostId: host.userId,
      joinCode,
      courseName: source.courseName,
      courseLocation: source.courseLocation,
      teeName: source.teeName,
      teeColour: source.teeColour,
      teeSetSnapshot: source.teeSetSnapshot ?? {},
      scoringFormat: source.scoringFormat,
      holesCount: source.holesCount,
      courseRating: source.courseRating,
      slopeRating: source.slopeRating,
      templateFromId: source.id,
      status: "setup",
    },
  });
  return NextResponse.json({ round }, { status: 201 });
}
