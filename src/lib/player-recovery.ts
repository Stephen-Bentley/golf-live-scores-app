import { createHash } from "node:crypto";

export const RECOVERY_MINUTES = 15;
export const RECOVERY_TOKEN_PATTERN = /^[a-zA-Z0-9_-]{43}$/;

export function hashRecoveryToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
