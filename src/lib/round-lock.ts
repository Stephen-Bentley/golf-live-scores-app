import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export function withRoundLock<T>(
  roundId: string,
  action: (tx: Prisma.TransactionClient) => Promise<T>
) {
  return prisma.$transaction(async (tx) => {
    // Serialize roster and score changes so group capacity and score versions
    // are checked against the state that the write will actually update.
    await tx.$queryRaw`SELECT "id" FROM "Round" WHERE "id" = ${roundId} FOR UPDATE`;
    return action(tx);
  });
}
