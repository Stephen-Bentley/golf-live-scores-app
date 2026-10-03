import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  status: z.enum(["setup", "active", "ready_for_export", "closed", "archived"]),
  joinCodeActive: z.boolean().optional(),
});

export async function PATCH(request: Request, { params }: Params) {
  const { id } = await params;
  const session = await getSession();
  if (!session || session.role !== "host") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const round = await prisma.round.findUnique({ where: { id } });
    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    if (round.hostId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const updated = await prisma.round.update({
      where: { id },
      data: {
        status: body.status,
        ...(body.joinCodeActive !== undefined
          ? { joinCodeActive: body.joinCodeActive }
          : {}),
        ...(body.status === "closed" ? { completedAt: new Date() } : {}),
      },
    });

    return NextResponse.json({
      round: {
        id: updated.id,
        status: updated.status,
        joinCodeActive: updated.joinCodeActive,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }
    console.error("status update error", error);
    return NextResponse.json({ error: "Failed to update status" }, { status: 500 });
  }
}
