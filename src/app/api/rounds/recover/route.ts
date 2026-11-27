import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createPlayerSessionToken, writePlayerSessionCookie } from "@/lib/auth";
import { RECOVERY_TOKEN_PATTERN, hashRecoveryToken } from "@/lib/player-recovery";
import { withRoundLock } from "@/lib/round-lock";

const headers = { "Cache-Control": "private, no-store" };
const unavailable = () => NextResponse.json(
  { error: "This recovery link is expired, revoked, or already used. Ask the host for a new one." },
  { status: 404, headers },
);

export async function POST(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0] !== "application/json") return unavailable();
  const input = await request.json().catch(() => null);
  if (typeof input?.token !== "string" || !RECOVERY_TOKEN_PATTERN.test(input.token)) return unavailable();

  const tokenHash = hashRecoveryToken(input.token);
  const link = await prisma.playerRecoveryLink.findUnique({
    where: { tokenHash },
    select: { playerId: true, player: { select: { roundId: true } } },
  });
  if (!link) return unavailable();
  const { roundId } = link.player;

  const sessionToken = await withRoundLock(roundId, async (tx) => {
    const round = await tx.round.findUnique({ where: { id: roundId }, select: { status: true } });
    if (!round || round.status === "closed" || round.status === "archived") return null;

    const { count } = await tx.playerRecoveryLink.deleteMany({
      where: { playerId: link.playerId, tokenHash, expiresAt: { gt: new Date() } },
    });
    if (!count) return null;
    return createPlayerSessionToken({ playerId: link.playerId, roundId }, tx);
  });
  if (!sessionToken) return unavailable();

  await writePlayerSessionCookie(sessionToken);
  return NextResponse.json({ roundId }, { headers });
}
