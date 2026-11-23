import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getHostSession } from "@/lib/auth";
import { withRoundLock } from "@/lib/round-lock";
import type { AllianceDraw } from "@/lib/round-results";

type Params = { params: Promise<{ id: string }> };

export async function POST(_request: Request, { params }: Params) {
  const { id: roundId } = await params;
  const host = await getHostSession();
  if (!host) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return await withRoundLock(roundId, async (tx) => {
      const round = await tx.round.findUnique({
        where: { id: roundId },
        include: { players: { select: { teamId: true } } },
      });
      if (!round) return NextResponse.json({ error: "Round not found." }, { status: 404 });
      if (round.hostId !== host.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      if (round.teamScoring !== "mystery_better_ball_alliance" || round.status === "archived") {
        return NextResponse.json({ error: "This round cannot draw mystery alliances." }, { status: 400 });
      }
      if (round.allianceDraw) return NextResponse.json({ drawn: true });

      const pairCounts = new Map<string | null, number>();
      for (const player of round.players) {
        pairCounts.set(player.teamId, (pairCounts.get(player.teamId) ?? 0) + 1);
      }
      const pairIds = [...pairCounts.keys()].filter((id) => id !== null);
      if (pairCounts.has(null) || pairIds.some((id) => pairCounts.get(id) !== 2)) {
        return NextResponse.json({ error: "Assign each player to a two-player Betterball pair before drawing." }, { status: 409 });
      }
      if (pairIds.length < 2 || pairIds.length % 2 !== 0) {
        return NextResponse.json({ error: "The draw needs an even number of Betterball pairs, with at least two pairs." }, { status: 409 });
      }

      for (let i = pairIds.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [pairIds[i], pairIds[j]] = [pairIds[j], pairIds[i]];
      }
      const draw: AllianceDraw = [];
      for (let i = 0; i < pairIds.length; i += 2) {
        draw.push([pairIds[i], pairIds[i + 1]]);
      }
      await tx.round.update({ where: { id: roundId }, data: { allianceDraw: draw } });
      return NextResponse.json({ drawn: true }, { status: 201 });
    });
  } catch (error) {
    console.error("alliance draw error", error);
    return NextResponse.json({ error: "Could not draw mystery alliances." }, { status: 500 });
  }
}
