import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getHostSession } from "@/lib/auth";
import { RECOVERY_MINUTES, hashRecoveryToken } from "@/lib/player-recovery";
import { withRoundLock } from "@/lib/round-lock";

type Params = { params: Promise<{ id: string; playerId: string }> };

async function setRecoveryLink({ params }: Params, issue: boolean) {
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, playerId } = await params;
  return withRoundLock(id, async (tx) => {
    const round = await tx.round.findUnique({ where: { id }, select: { hostId: true, status: true } });
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
    if (round.hostId !== host.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const player = await tx.player.findFirst({ where: { id: playerId, roundId: id }, select: { id: true } });
    if (!player) return NextResponse.json({ error: "Player not found" }, { status: 404 });

    const headers = { "Cache-Control": "private, no-store" };
    if (!issue) {
      await tx.playerRecoveryLink.deleteMany({ where: { playerId } });
      return NextResponse.json({ ok: true }, { headers });
    }

    if (round.status === "closed" || round.status === "archived") {
      return NextResponse.json({ error: "This round is closed." }, { status: 403 });
    }
    const token = randomBytes(32).toString("base64url");
    const expiresAt = new Date(Date.now() + RECOVERY_MINUTES * 60_000);
    const data = { tokenHash: hashRecoveryToken(token), expiresAt };
    await tx.playerRecoveryLink.upsert({ where: { playerId }, create: { playerId, ...data }, update: data });
    return NextResponse.json({ token, expiresAt }, { status: 201, headers });
  });
}

export function POST(_request: Request, params: Params) {
  return setRecoveryLink(params, true);
}

export function DELETE(_request: Request, params: Params) {
  return setRecoveryLink(params, false);
}
