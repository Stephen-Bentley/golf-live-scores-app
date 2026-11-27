CREATE TABLE "PlayerRecoveryLink" (
    "playerId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PlayerRecoveryLink_pkey" PRIMARY KEY ("playerId")
);

CREATE UNIQUE INDEX "PlayerRecoveryLink_tokenHash_key" ON "PlayerRecoveryLink"("tokenHash");
ALTER TABLE "PlayerRecoveryLink" ADD CONSTRAINT "PlayerRecoveryLink_playerId_fkey"
    FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;
