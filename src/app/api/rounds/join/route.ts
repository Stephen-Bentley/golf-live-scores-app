import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setPlayerSessionCookie } from "@/lib/auth";
import { joinRoundSchema } from "@/lib/types";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";

const MAX_PLAYERS = 100;

export async function POST(request: Request) {
  try {
    const body = joinRoundSchema.parse(await request.json());
    const ip = request.headers.get("x-forwarded-for") || "local";
    const limit = checkRateLimit(`join:${ip}`, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many join attempts. Try again shortly." },
        { status: 429 }
      );
    }
    const code = body.joinCode.trim().toUpperCase();
    const displayName = body.displayName.trim().replace(/\s+/g, " ");

    const round = await prisma.round.findUnique({
      where: { joinCode: code },
      include: { players: true },
    });

    if (
      !round ||
      !round.joinCodeActive ||
      round.status === "closed" ||
      round.status === "archived"
    ) {
      return NextResponse.json(
        { error: "Invalid or inactive join code" },
        { status: 404 }
      );
    }

    if (round.players.length >= MAX_PLAYERS) {
      return NextResponse.json(
        { error: `This round is full (max ${MAX_PLAYERS} players)` },
        { status: 400 }
      );
    }

    const nameTaken = round.players.some(
      (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
    );
    if (nameTaken) {
      return NextResponse.json(
        { error: "That name is already taken in this round" },
        { status: 409 }
      );
    }

    let teamId: string | undefined;
    if (body.teamName) {
      const team = await prisma.team.upsert({
        where: { roundId_name: { roundId: round.id, name: body.teamName } },
        create: { roundId: round.id, name: body.teamName },
        update: {},
      });
      teamId = team.id;
    }

    const player = await prisma.player.create({
      data: {
        roundId: round.id,
        displayName,
        playingHandicap: body.playingHandicap,
        memberRole: "player",
        teamId,
      },
    });

    await setPlayerSessionCookie({
      role: "player",
      roundId: round.id,
      playerId: player.id,
      displayName: player.displayName,
      playingHandicap: player.playingHandicap,
    });

    return NextResponse.json({
      ok: true,
      player: {
        id: player.id,
        displayName: player.displayName,
        playingHandicap: player.playingHandicap,
      },
      round: {
        id: round.id,
        courseName: round.courseName,
        teeName: round.teeName,
        status: round.status,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid join data", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("join error", error);
    return NextResponse.json({ error: "Failed to join round" }, { status: 500 });
  }
}
