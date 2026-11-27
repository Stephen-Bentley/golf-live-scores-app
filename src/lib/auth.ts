/**
 * Host + player session helpers.
 * Hosts may also hold a player session for the same browser (score entry).
 */

import { cookies, headers } from "next/headers";
import type { Prisma } from "@prisma/client";
import { isIPv4 } from "node:net";
import { prisma } from "./db";
import { createHash, randomBytes } from "crypto";
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

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function shouldSetSecureSessionCookie(
  requestHost: string | null,
  forwardedProto: string | null,
  env: NodeJS.ProcessEnv = process.env,
) {
  if (env.NODE_ENV !== "production") return false;
  if (forwardedProto && forwardedProto.trim().toLowerCase() !== "http") return true;

  let appUrl: URL;
  try {
    appUrl = new URL(env.NEXT_PUBLIC_APP_URL ?? "");
  } catch {
    return true;
  }
  if (appUrl.protocol !== "http:" || appUrl.host !== requestHost?.toLowerCase()) return true;

  // HTTP is supported for an explicitly configured loopback or private IPv4 origin.
  const host = appUrl.hostname;
  if (host === "localhost" || host === "[::1]") return false;
  if (!isIPv4(host)) return true;
  const [first, second] = host.split(".").map(Number);
  return !(first === 10 || first === 127 || (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168));
}

async function sessionCookieOptions() {
  const request = await headers();
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: shouldSetSecureSessionCookie(request.get("host"), request.get("x-forwarded-proto")),
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

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

export function guestHostingEnabled(env: NodeJS.ProcessEnv = process.env) {
  return env.NODE_ENV !== "production" || env.ALLOW_GUEST_HOSTS === "true";
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
  const token = randomBytes(32).toString("base64url");
  await prisma.authSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      role: "host",
      userId: session.userId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  jar.set(HOST_SESSION_COOKIE, token, await sessionCookieOptions());
}

export async function createPlayerSessionToken(
  session: Pick<PlayerSession, "playerId" | "roundId">,
  db: Pick<Prisma.TransactionClient, "authSession"> = prisma,
) {
  const token = randomBytes(32).toString("base64url");
  await db.authSession.create({
    data: {
      tokenHash: hashSessionToken(token),
      role: "player",
      playerId: session.playerId,
      roundId: session.roundId,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000),
    },
  });
  return token;
}

export async function writePlayerSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(PLAYER_SESSION_COOKIE, token, await sessionCookieOptions());
}

export async function setPlayerSessionCookie(session: PlayerSession) {
  await writePlayerSessionCookie(await createPlayerSessionToken(session));
}

export async function clearSessions() {
  const jar = await cookies();
  const hostToken = jar.get(HOST_SESSION_COOKIE)?.value;
  const playerToken = jar.get(PLAYER_SESSION_COOKIE)?.value;
  const hashes = [hostToken, playerToken]
    .filter((token): token is string => Boolean(token))
    .map(hashSessionToken);
  if (hashes.length) {
    await prisma.authSession.deleteMany({ where: { tokenHash: { in: hashes } } });
  }
  jar.delete(HOST_SESSION_COOKIE);
  jar.delete(PLAYER_SESSION_COOKIE);
}

export async function getHostSession(): Promise<HostSession | null> {
  const jar = await cookies();
  const token = jar.get(HOST_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (!session || session.role !== "host" || !session.userId || session.expiresAt <= new Date()) {
    return null;
  }
  const user = await prisma.user.findUnique({ where: { id: session.userId } });
  if (!user) return null;
  return { userId: user.id, email: user.email, role: "host" };
}

export async function getPlayerSession(): Promise<PlayerSession | null> {
  const jar = await cookies();
  const token = jar.get(PLAYER_SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.authSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
  });
  if (
    !session ||
    session.role !== "player" ||
    !session.playerId ||
    !session.roundId ||
    session.expiresAt <= new Date()
  ) {
    return null;
  }
  const player = await prisma.player.findFirst({
    where: { id: session.playerId, roundId: session.roundId },
  });
  if (!player) return null;
  return {
    role: "player",
    roundId: player.roundId,
    playerId: player.id,
    displayName: player.displayName,
    playingHandicap: player.playingHandicap,
  };
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
