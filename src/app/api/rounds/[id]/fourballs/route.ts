import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { getHostSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";
import type { TeeSetSnapshot } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

const fourballSchema = z.object({
  name: z.string().trim().min(1).max(40),
  teeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  startingHole: z.number().int().min(1).max(18),
});

export async function POST(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = fourballSchema.parse(await request.json());
    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({ where: { id: roundId } });
      if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
      if (round.hostId !== host.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (round.status === "closed" || round.status === "archived") {
        return NextResponse.json({ error: "This round is closed." }, { status: 403 });
      }
      const { holes } = round.teeSetSnapshot as TeeSetSnapshot;
      if (!holes.some((hole) => hole.number === body.startingHole)) {
        return NextResponse.json({ error: "Starting hole is outside this round." }, { status: 400 });
      }
      const fourball = await tx.fourball.create({ data: { roundId, ...body } });
      return NextResponse.json({ fourball }, { status: 201 });
    });
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "Invalid fourball details." }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "That fourball name is already in use." }, { status: 409 });
    }
    console.error("fourball create error", error);
    return NextResponse.json({ error: "Could not create fourball." }, { status: 500 });
  }
}
