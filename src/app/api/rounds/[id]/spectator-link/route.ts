import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getHostSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";

type Params = { params: Promise<{ id: string }> };

async function manageLink({ params }: Params, enabled?: boolean) {
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  return withRoundLock(id, async (tx) => {
    const round = await tx.round.findUnique({ where: { id }, select: { hostId: true, spectatorToken: true } });
    if (!round) return NextResponse.json({ error: "Round not found" }, { status: 404 });
    if (round.hostId !== host.userId) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const token = enabled === undefined ? round.spectatorToken
      : enabled ? round.spectatorToken ?? randomBytes(32).toString("base64url") : null;
    if (token !== round.spectatorToken) {
      await tx.round.update({ where: { id }, data: { spectatorToken: token } });
    }
    return NextResponse.json({ token }, { headers: { "Cache-Control": "private, no-store" } });
  });
}

export function GET(_request: Request, params: Params) {
  return manageLink(params);
}

export function POST(_request: Request, params: Params) {
  return manageLink(params, true);
}

export function DELETE(_request: Request, params: Params) {
  return manageLink(params, false);
}
