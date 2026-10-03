import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { generateRoundWorkbook } from "@/lib/export";
import type { Hole } from "@/domain/scoring";

type Params = { params: Promise<{ id: string }> };

const MAX_EXPORTS_PER_HOUR = 5;

export async function POST(_request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const session = await getSession();
  if (!session || session.role !== "host") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const round = await prisma.round.findUnique({
    where: { id: roundId },
    include: {
      players: true,
      scores: true,
    },
  });

  if (!round) {
    return NextResponse.json({ error: "Round not found" }, { status: 404 });
  }

  if (round.hostId !== session.userId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (
    round.status !== "ready_for_export" &&
    round.status !== "closed"
  ) {
    return NextResponse.json(
      { error: "Mark the round ready for export before downloading" },
      { status: 400 }
    );
  }

  // Rate limit
  const oneHourAgo = new Date(Date.now() - 3_600_000);
  const recentExports = await prisma.exportJob.count({
    where: {
      roundId,
      createdAt: { gte: oneHourAgo },
    },
  });
  if (recentExports >= MAX_EXPORTS_PER_HOUR) {
    return NextResponse.json(
      { error: "Export limit reached (5 per hour). Try again later." },
      { status: 429 }
    );
  }

  const snapshot = round.teeSetSnapshot as {
    name: string;
    colour: string;
    holes: Hole[];
  };

  const buffer = await generateRoundWorkbook({
    id: round.id,
    courseName: round.courseName,
    courseLocation: round.courseLocation,
    teeName: round.teeName,
    teeColour: round.teeColour,
    joinCode: round.joinCode,
    status: round.status,
    teeSetSnapshot: snapshot,
    players: round.players.map((p) => ({
      id: p.id,
      displayName: p.displayName,
      playingHandicap: p.playingHandicap,
    })),
    scores: round.scores.map((s) => ({
      playerId: s.playerId,
      holeNumber: s.holeNumber,
      grossScore: s.grossScore,
      updatedAt: s.updatedAt.toISOString(),
    })),
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await prisma.exportJob.create({
    data: {
      roundId,
      requestedBy: session.userId,
      status: "completed",
      expiresAt,
    },
  });

  const filename = `fairway-live-${round.courseName
    .replace(/[^a-z0-9]+/gi, "-")
    .toLowerCase()}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
