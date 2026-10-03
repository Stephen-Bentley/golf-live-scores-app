/**
 * Host + player session helpers.
 * Hosts may also hold a player session for the same browser (score entry).
 */

import { cookies } from "next/headers";
import { prisma } from "./db";
import { randomBytes } from "crypto";
import { makeJoinCode as generateJoinCode } from "./join-code";

export const HOST_SESSION_COOKIE = "fairway_host_session";
export const PLAYER_SESSION_COOKIE = "fairway_player_session";

const SESSION_DAYS = 14;
const MAGIC_LINK_MINUTES = 30;

export type HostSession = {
  userId: string;
  email: string;
  role: "host";
  displayName?: string;
};

export type PlayerSession = {
  role: "player";
  roundId: string;
  playerId: string;
  displayName: string;
  playingHandicap: number;
};

export type Session = HostSession | PlayerSession;

export async function createMagicLink(email: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAGIC_LINK_MINUTES * 60 * 1000);

  await prisma.magicLinkToken.create({
    data: { email: email.toLowerCase().trim(), token, expiresAt },
  });

  return token;
}

export async function consumeMagicLink(
  token: string
): Promise<HostSession | null> {
  const record = await prisma.magicLinkToken.findUnique({ where: { token } });
  if (!record || record.usedAt || record.expiresAt < new Date()) {
    return null;
  }

  await prisma.magicLinkToken.update({
    where: { id: record.id },
    data: { usedAt: new Date() },
  });

  const email = record.email.toLowerCase();
  let user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    user = await prisma.user.create({ data: { email } });
  }

  return { userId: user.id, email: user.email, role: "host" };
}

/** Create a host account without email (local/demo friendly). */
export async function createGuestHost(displayName: string): Promise<HostSession> {
  const slug = displayName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  const idPart = randomBytes(4).toString("hex");
  const email = `guest-${slug || "host"}-${idPart}@fairway.local`;

  const user = await prisma.user.create({ data: { email } });
  return {
    userId: user.id,
    email: user.email,
    role: "host",
    displayName: displayName.trim(),
  };
}

export async function setHostSessionCookie(session: HostSession) {
  const jar = await cookies();
  jar.set(HOST_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function setPlayerSessionCookie(session: PlayerSession) {
  const jar = await cookies();
  jar.set(PLAYER_SESSION_COOKIE, JSON.stringify(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessions() {
  const jar = await cookies();
  jar.delete(HOST_SESSION_COOKIE);
  jar.delete(PLAYER_SESSION_COOKIE);
}

export async function getHostSession(): Promise<HostSession | null> {
  const jar = await cookies();
  const hostRaw = jar.get(HOST_SESSION_COOKIE)?.value;
  if (!hostRaw) return null;
  try {
    const parsed = JSON.parse(hostRaw) as HostSession;
    if (parsed.role === "host" && parsed.userId && parsed.email) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function getPlayerSession(): Promise<PlayerSession | null> {
  const jar = await cookies();
  const playerRaw = jar.get(PLAYER_SESSION_COOKIE)?.value;
  if (!playerRaw) return null;
  try {
    const parsed = JSON.parse(playerRaw) as PlayerSession;
    if (parsed.role === "player" && parsed.roundId && parsed.playerId) {
      return parsed;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/** Prefer host when both exist (dashboard); score entry should use getPlayerSession. */
export async function getSession(): Promise<Session | null> {
  const host = await getHostSession();
  if (host) return host;
  return getPlayerSession();
}

export function makeJoinCode(): string {
  return generateJoinCode();
}
