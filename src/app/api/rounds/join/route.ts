import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { setPlayerSessionCookie } from "@/lib/auth";
import { joinRoundSchema } from "@/lib/types";
import { z } from "zod";
import { checkRateLimit } from "@/lib/rate-limit";
import { withRoundLock } from "@/lib/round-lock";
import { requiresTwoPlayerPair } from "@/domain/scoring";

const MAX_PLAYERS = 100;
const inviteSchema = z.object({ inviteCode: z.string().regex(/^[a-zA-Z0-9_-]{32}$/) });

export async function POST(request: Request) {
  try {
    const input = await request.json();
    const ip = request.headers.get("x-forwarded-for") || "local";
    const limit = checkRateLimit(`join:${ip}`, 20, 60_000);
    if (!limit.allowed) {
      return NextResponse.json(
        { error: "Too many join attempts. Try again shortly." },
        { status: 429 }
      );
    }
    if (input && typeof input === "object" && "inviteCode" in input) {
      const { inviteCode } = inviteSchema.parse(input);
      const player = await prisma.player.findUnique({
        where: { inviteCode },
        include: { round: true },
      });
      if (
        !player || !player.round.joinCodeActive ||
        player.round.status === "closed" || player.round.status === "archived"
      ) {
        return NextResponse.json({ error: "Invalid or inactive player link" }, { status: 404 });
      }
      return await joinPlayer(player, player.round);
    }
    const body = joinRoundSchema.parse(input);
    const code = body.joinCode.trim().toUpperCase();
    const displayName = body.displayName.trim().replace(/\s+/g, " ");

    const found = await prisma.round.findUnique({
      where: { joinCode: code },
      select: { id: true },
    });
    const invalidCode = () => NextResponse.json({ error: "Invalid or inactive join code" }, { status: 404 });
    if (!found) return invalidCode();

    const joined = await withRoundLock(found.id, async (tx) => {
      const round = await tx.round.findUnique({
        where: { id: found.id },
        include: { players: true },
      });
      if (!round || !round.joinCodeActive || round.status === "closed" || round.status === "archived") {
        return invalidCode();
      }
      const existingPlayer = round.players.find((p) => p.displayName.toLowerCase() === displayName.toLowerCase());
      if (existingPlayer) {
        return NextResponse.json({
          error: existingPlayer.inviteCode
            ? "You’re already on the roster. Ask the host for your private player link."
            : "That name is already taken in this round",
        }, { status: 409 });
      }
      if (round.players.length >= MAX_PLAYERS) {
        return NextResponse.json({ error: `This round is full (max ${MAX_PLAYERS} players)` }, { status: 400 });
      }

      let teamId: string | undefined;
      if (body.teamName) {
        const team = await tx.team.upsert({
          where: { roundId_name: { roundId: round.id, name: body.teamName } },
          create: { roundId: round.id, name: body.teamName },
          update: {},
        });
        if (requiresTwoPlayerPair(round.teamScoring) && round.players.filter((p) => p.teamId === team.id).length >= 2) {
          return NextResponse.json({ error: "This Betterball pair already has two players." }, { status: 409 });
        }
        teamId = team.id;
      }
      const player = await tx.player.create({
        data: {
          roundId: round.id,
          displayName,
          playingHandicap: body.playingHandicap,
          memberRole: "player",
          teamId,
        },
      });
      return { player, round };
    });
    return joined instanceof NextResponse ? joined : await joinPlayer(joined.player, joined.round);
  } catch (error) {
    if (error instanceof z.ZodError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: "Invalid join data", details: error instanceof z.ZodError ? error.flatten() : undefined },
        { status: 400 }
      );
    }
    console.error("join error", error);
    return NextResponse.json({ error: "Failed to join round" }, { status: 500 });
  }
}

async function joinPlayer(
  player: { id: string; displayName: string; playingHandicap: number },
  round: { id: string; courseName: string; teeName: string; status: string }
) {
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
}
