-- CreateTable
CREATE TABLE "RoomSegmentCard" (
    "id" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "week" INTEGER NOT NULL,
    "segment" INTEGER NOT NULL,
    "options" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomSegmentCard_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomSegmentVote" (
    "id" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "roomPlayerId" TEXT NOT NULL,
    "optionIndex" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RoomSegmentVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RoomSegmentCard_roomId_week_segment_key" ON "RoomSegmentCard"("roomId", "week", "segment");

-- CreateIndex
CREATE UNIQUE INDEX "RoomSegmentVote_cardId_roomPlayerId_key" ON "RoomSegmentVote"("cardId", "roomPlayerId");

-- AddForeignKey
ALTER TABLE "RoomSegmentCard" ADD CONSTRAINT "RoomSegmentCard_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSegmentVote" ADD CONSTRAINT "RoomSegmentVote_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "RoomSegmentCard"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomSegmentVote" ADD CONSTRAINT "RoomSegmentVote_roomPlayerId_fkey" FOREIGN KEY ("roomPlayerId") REFERENCES "RoomPlayer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
