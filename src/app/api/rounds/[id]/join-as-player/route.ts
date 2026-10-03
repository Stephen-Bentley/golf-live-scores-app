import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  getHostSession,
  setPlayerSessionCookie,
} from "@/lib/auth";

type Params = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  displayName: z.string().trim().min(1).max(40),
  playingHandicap: z.number().int().min(0).max(54),
});

const MAX_PLAYERS = 100;

/**
 * Host joins their own round as a scoring player (sets player session cookie).
 */
export async function POST(request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) {
    return NextResponse.json({ error: "Host sign-in required" }, { status: 401 });
  }

  try {
    const body = bodySchema.parse(await request.json());
    const displayName = body.displayName.trim().replace(/\s+/g, " ");

    const round = await prisma.round.findUnique({
      where: { id: roundId },
      include: { players: true },
    });

    if (!round) {
      return NextResponse.json({ error: "Round not found" }, { status: 404 });
    }
    if (round.hostId !== host.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    if (round.status === "closed" || round.status === "archived") {
      return NextResponse.json(
        { error: "This round is closed." },
        { status: 403 }
      );
    }

    // Reuse existing player with same name (case-insensitive) if host already joined
    let player = round.players.find(
      (p) => p.displayName.toLowerCase() === displayName.toLowerCase()
    );

    if (!player) {
      if (round.players.length >= MAX_PLAYERS) {
        return NextResponse.json(
          { error: `This round is full (max ${MAX_PLAYERS} players)` },
          { status: 400 }
        );
      }
      player = await prisma.player.create({
        data: {
          roundId: round.id,
          displayName,
          playingHandicap: body.playingHandicap,
          memberRole: "host",
        },
      });
    }

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
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid player details" }, { status: 400 });
    }
    console.error("join-as-player error", error);
    return NextResponse.json({ error: "Failed to join as player" }, { status: 500 });
  }
}
