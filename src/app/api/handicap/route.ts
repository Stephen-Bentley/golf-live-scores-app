import { NextResponse } from "next/server";
import { z } from "zod";
import { calculatePlayingHandicap } from "@/domain/handicap";

export async function POST(request: Request) {
  try {
    const body = z
      .object({
        handicapIndex: z.number().min(0).max(54),
        slopeRating: z.number().min(55).max(155),
        courseRating: z.number(),
        coursePar: z.number().int().min(27).max(90),
      })
      .parse(await request.json());
    const playingHandicap = calculatePlayingHandicap(body);
    return NextResponse.json({ playingHandicap });
  } catch {
    return NextResponse.json({ error: "Invalid handicap input" }, { status: 400 });
  }
}
