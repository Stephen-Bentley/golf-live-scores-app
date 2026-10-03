import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getHostSession } from "@/lib/auth";

export async function GET() {
  const host = await getHostSession();
  if (!host) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const courses = await prisma.course.findMany({
    where: { hostId: host.userId, active: true },
    include: { teeSets: { include: { holes: true } } },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json({ courses });
}

const saveSchema = z.object({
  name: z.string().min(1),
  location: z.string().min(1),
  externalId: z.string().optional(),
  source: z.string().optional(),
  teeSet: z.object({
    name: z.string().min(1),
    colour: z.string().min(1),
    rating: z.number().optional().nullable(),
    slope: z.number().int().optional().nullable(),
    holes: z
      .array(
        z.object({
          number: z.number().int().min(1).max(18),
          par: z.number().int().min(3).max(6),
          strokeIndex: z.number().int().min(1).max(18),
          distance: z.number().int().nullable().optional(),
        })
      )
      .min(9)
      .max(18),
  }),
});

export async function POST(request: Request) {
  const host = await getHostSession();
  if (!host) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const body = saveSchema.parse(await request.json());
    let course =
      body.externalId
        ? await prisma.course.findFirst({
            where: { hostId: host.userId, externalId: body.externalId },
          })
        : null;
    if (!course) {
      course = await prisma.course.create({
        data: {
          hostId: host.userId,
          name: body.name,
          location: body.location,
          externalId: body.externalId,
          source: body.source ?? "golfcourseapi",
        },
      });
    } else {
      course = await prisma.course.update({
        where: { id: course.id },
        data: { name: body.name, location: body.location, active: true },
      });
    }
    const teeSet = await prisma.teeSet.create({
      data: {
        courseId: course.id,
        name: body.teeSet.name,
        colour: body.teeSet.colour,
        rating: body.teeSet.rating ?? null,
        slope: body.teeSet.slope ?? null,
        holes: {
          create: body.teeSet.holes.map((h) => ({
            number: h.number,
            par: h.par,
            strokeIndex: h.strokeIndex,
            distance: h.distance ?? null,
          })),
        },
      },
      include: { holes: true },
    });
    return NextResponse.json({ course, teeSet }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid course data" }, { status: 400 });
    }
    console.error(error);
    return NextResponse.json({ error: "Failed to save course" }, { status: 500 });
  }
}
