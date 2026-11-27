CREATE TABLE "ScrambleScore" (
    "fourballId" TEXT NOT NULL,
    "holeNumber" INTEGER NOT NULL,
    "grossScore" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "enteredBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScrambleScore_pkey" PRIMARY KEY ("fourballId", "holeNumber")
);

ALTER TABLE "ScrambleScore" ADD CONSTRAINT "ScrambleScore_fourballId_fkey"
    FOREIGN KEY ("fourballId") REFERENCES "Fourball"("id") ON DELETE CASCADE ON UPDATE CASCADE;
