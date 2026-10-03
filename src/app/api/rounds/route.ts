import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession, makeJoinCode } from "@/lib/auth";
import { createRoundSchema } from "@/lib/types";
import { z } from "zod";

export async function GET() {
  const session = await getSession();
  if (!session || session.role !== "host") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rounds = await prisma.round.findMany({
    where: { hostId: session.userId },
    orderBy: { createdAt: "desc" },
    include: {
      players: true,
      _count: { select: { scores: true } },
    },
  });

  return NextResponse.json({ rounds });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session || session.role !== "host") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createRoundSchema.parse(await request.json());

    // Validate unique stroke indexes
    const indexes = body.teeSetSnapshot.holes.map((h) => h.strokeIndex);
    const expected = body.holesCount ?? body.teeSetSnapshot.holes.length;
    if (new Set(indexes).size !== expected) {
      return NextResponse.json(
        { error: `Stroke indexes must be unique 1–${expected}` },
        { status: 400 }
      );
    }

    let joinCode = makeJoinCode();
    // Ensure uniqueness
    for (let i = 0; i < 5; i++) {
      const existing = await prisma.round.findUnique({ where: { joinCode } });
      if (!existing) break;
      joinCode = makeJoinCode();
    }

    const holesCount = body.holesCount ?? body.teeSetSnapshot.holes.length;
    if (body.teeSetSnapshot.holes.length !== holesCount) {
      return NextResponse.json(
        { error: `Expected ${holesCount} holes in snapshot` },
        { status: 400 }
      );
    }

    const round = await prisma.round.create({
      data: {
        hostId: session.userId,
        joinCode,
        courseName: body.courseName,
        courseLocation: body.courseLocation,
        teeName: body.teeSetSnapshot.name,
        teeColour: body.teeSetSnapshot.colour,
        teeSetSnapshot: body.teeSetSnapshot,
        status: "setup",
        scoringFormat: body.scoringFormat ?? "stableford",
        holesCount,
        courseRating: body.courseRating ?? body.teeSetSnapshot.rating ?? null,
        slopeRating: body.slopeRating ?? body.teeSetSnapshot.slope ?? null,
        teamScoring: body.teamScoring ?? "aggregate",
      },
    });

    return NextResponse.json({ round }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid round data", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("create round error", error);
    return NextResponse.json({ error: "Failed to create round" }, { status: 500 });
  }
}
