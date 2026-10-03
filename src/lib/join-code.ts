import { randomBytes } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** Random non-sequential join code (6 chars, no ambiguous 0/O/1/I). */
export function makeJoinCode(length = 6): string {
  const bytes = randomBytes(length);
  return Array.from(
    bytes,
    (b, i) => ALPHABET[(b + i * 17) % ALPHABET.length]
  ).join("");
}

export function normalizeJoinCode(code: string): string {
  return code.trim().toUpperCase();
}

export function isValidJoinCodeFormat(code: string): boolean {
  const normalized = normalizeJoinCode(code);
  return (
    normalized.length >= 4 &&
    normalized.length <= 12 &&
    /^[A-Z0-9]+$/.test(normalized)
  );
}
