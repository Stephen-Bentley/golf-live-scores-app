import { NextResponse } from "next/server";
import {
  clearSessions,
  getHostSession,
  getPlayerSession,
} from "@/lib/auth";

export async function GET() {
  const host = await getHostSession();
  const player = await getPlayerSession();
  return NextResponse.json({
    session: host ?? player,
    host,
    player,
  });
}

export async function DELETE() {
  await clearSessions();
  return NextResponse.json({ ok: true });
}
