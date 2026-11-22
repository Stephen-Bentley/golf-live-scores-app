-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "RoundStatus" AS ENUM ('setup', 'active', 'ready_for_export', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "MemberRole" AS ENUM ('host', 'player');

-- CreateEnum
CREATE TYPE "SessionRole" AS ENUM ('host', 'player');

-- CreateEnum
CREATE TYPE "ScoringFormat" AS ENUM ('stableford', 'stroke', 'modified_stableford');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "displayName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Course" (
    "id" TEXT NOT NULL,
    "hostId" TEXT,
    "name" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "source" TEXT,
    "externalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Course_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeeSet" (
    "id" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "colour" TEXT NOT NULL,
    "rating" DOUBLE PRECISION,
    "slope" INTEGER,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "TeeSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hole" (
    "id" TEXT NOT NULL,
    "teeSetId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "par" INTEGER NOT NULL,
    "strokeIndex" INTEGER NOT NULL,
    "distance" INTEGER,

    CONSTRAINT "Hole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "joinCodeActive" BOOLEAN NOT NULL DEFAULT true,
    "courseName" TEXT NOT NULL,
    "courseLocation" TEXT NOT NULL,
    "teeName" TEXT NOT NULL,
    "teeColour" TEXT NOT NULL,
    "teeSetSnapshot" JSONB NOT NULL,
    "status" "RoundStatus" NOT NULL DEFAULT 'setup',
    "scoringFormat" "ScoringFormat" NOT NULL DEFAULT 'stableford',
    "holesCount" INTEGER NOT NULL DEFAULT 18,
    "teamScoring" TEXT NOT NULL DEFAULT 'aggregate',
    "courseRating" DOUBLE PRECISION,
    "slopeRating" INTEGER,
    "templateFromId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Round_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "teamId" TEXT,
    "displayName" TEXT NOT NULL,
    "playingHandicap" INTEGER NOT NULL,
    "memberRole" "MemberRole" NOT NULL DEFAULT 'player',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEntry" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "grossScore" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enteredBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScoreEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScoreEvent" (
    "id" TEXT NOT NULL,
    "scoreEntryId" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "previousScore" INTEGER,
    "newScore" INTEGER NOT NULL,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScoreEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HoleNote" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HoleNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExportJob" (
    "id" TEXT NOT NULL,
    "roundId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "filePath" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "ExportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MagicLinkToken" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLinkToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "role" "SessionRole" NOT NULL,
    "userId" TEXT,
    "playerId" TEXT,
    "roundId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Course_hostId_idx" ON "Course"("hostId");

-- CreateIndex
CREATE INDEX "Course_externalId_idx" ON "Course"("externalId");

-- CreateIndex
CREATE INDEX "TeeSet_courseId_idx" ON "TeeSet"("courseId");

-- CreateIndex
CREATE INDEX "Hole_teeSetId_idx" ON "Hole"("teeSetId");

-- CreateIndex
CREATE UNIQUE INDEX "Hole_teeSetId_number_key" ON "Hole"("teeSetId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Hole_teeSetId_strokeIndex_key" ON "Hole"("teeSetId", "strokeIndex");

-- CreateIndex
CREATE UNIQUE INDEX "Round_joinCode_key" ON "Round"("joinCode");

-- CreateIndex
CREATE INDEX "Round_hostId_idx" ON "Round"("hostId");

-- CreateIndex
CREATE INDEX "Round_status_idx" ON "Round"("status");

-- CreateIndex
CREATE INDEX "Team_roundId_idx" ON "Team"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "Team_roundId_name_key" ON "Team"("roundId", "name");

-- CreateIndex
CREATE INDEX "Player_roundId_idx" ON "Player"("roundId");

-- CreateIndex
CREATE INDEX "Player_teamId_idx" ON "Player"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Player_roundId_displayName_key" ON "Player"("roundId", "displayName");

-- CreateIndex
CREATE INDEX "ScoreEntry_roundId_idx" ON "ScoreEntry"("roundId");

-- CreateIndex
CREATE INDEX "ScoreEntry_playerId_idx" ON "ScoreEntry"("playerId");

-- CreateIndex
CREATE UNIQUE INDEX "ScoreEntry_roundId_playerId_holeNumber_key" ON "ScoreEntry"("roundId", "playerId", "holeNumber");

-- CreateIndex
CREATE INDEX "ScoreEvent_roundId_idx" ON "ScoreEvent"("roundId");

-- CreateIndex
CREATE INDEX "ScoreEvent_scoreEntryId_idx" ON "ScoreEvent"("scoreEntryId");

-- CreateIndex
CREATE INDEX "HoleNote_roundId_idx" ON "HoleNote"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "HoleNote_roundId_playerId_holeNumber_key" ON "HoleNote"("roundId", "playerId", "holeNumber");

-- CreateIndex
CREATE INDEX "ExportJob_roundId_idx" ON "ExportJob"("roundId");

-- CreateIndex
CREATE UNIQUE INDEX "MagicLinkToken_token_key" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE INDEX "MagicLinkToken_email_idx" ON "MagicLinkToken"("email");

-- CreateIndex
CREATE INDEX "MagicLinkToken_token_idx" ON "MagicLinkToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "AuthSession_tokenHash_key" ON "AuthSession"("tokenHash");

-- CreateIndex
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");

-- CreateIndex
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");

-- CreateIndex
CREATE INDEX "AuthSession_playerId_idx" ON "AuthSession"("playerId");

-- AddForeignKey
ALTER TABLE "Course" ADD CONSTRAINT "Course_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeeSet" ADD CONSTRAINT "TeeSet_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hole" ADD CONSTRAINT "Hole_teeSetId_fkey" FOREIGN KEY ("teeSetId") REFERENCES "TeeSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Round" ADD CONSTRAINT "Round_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Player" ADD CONSTRAINT "Player_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEntry" ADD CONSTRAINT "ScoreEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_scoreEntryId_fkey" FOREIGN KEY ("scoreEntryId") REFERENCES "ScoreEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScoreEvent" ADD CONSTRAINT "ScoreEvent_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoleNote" ADD CONSTRAINT "HoleNote_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HoleNote" ADD CONSTRAINT "HoleNote_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExportJob" ADD CONSTRAINT "ExportJob_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round"("id") ON DELETE CASCADE ON UPDATE CASCADE;
