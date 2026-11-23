CREATE TABLE "Fourball" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "teeTime" TEXT,
    "startingHole" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "Fourball_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Player"
    ADD COLUMN "fourballId" TEXT,
    ADD COLUMN "inviteCode" TEXT;

ALTER TABLE "Round" ADD COLUMN "allianceDraw" JSONB;

CREATE UNIQUE INDEX "Fourball_roundId_name_key" ON "Fourball"("roundId", "name");
CREATE UNIQUE INDEX "Player_inviteCode_key" ON "Player"("inviteCode");
CREATE INDEX "Player_fourballId_idx" ON "Player"("fourballId");

ALTER TABLE "Fourball" ADD CONSTRAINT "Fourball_roundId_fkey"
    FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Player" ADD CONSTRAINT "Player_fourballId_fkey"
    FOREIGN KEY ("fourballId") REFERENCES "Fourball"("id") ON DELETE SET NULL ON UPDATE CASCADE;
