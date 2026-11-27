ALTER TABLE "Round" ADD COLUMN "spectatorToken" TEXT;
CREATE UNIQUE INDEX "Round_spectatorToken_key" ON "Round"("spectatorToken");
