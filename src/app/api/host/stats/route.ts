import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getHostSession } from "@/lib/auth";

export async function GET() {
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rounds = await prisma.round.findMany({
    where: { hostId: host.userId },
    include: { players: true, _count: { select: { scores: true, exports: true } } },
  });

  const totalRounds = rounds.length;
  const totalPlayers = rounds.reduce((s, r) => s + r.players.length, 0);
  const byStatus = rounds.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});
  const totalExports = rounds.reduce((s, r) => s + r._count.exports, 0);

  return NextResponse.json({
    stats: {
      totalRounds,
      totalPlayers,
      totalExports,
      byStatus,
      averagePlayersPerRound:
        totalRounds === 0 ? 0 : Math.round((totalPlayers / totalRounds) * 10) / 10,
    },
  });
}
