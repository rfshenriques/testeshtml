-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "sequenceStartedAt" TIMESTAMP(3),
ADD COLUMN     "sequenceStopReason" TEXT,
ADD COLUMN     "sequenceStoppedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OutreachMessage" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedBy" TEXT,
ADD COLUMN     "clicks" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'sequence',
ADD COLUMN     "messageIdHeader" TEXT,
ADD COLUMN     "requiresApproval" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "OutreachMessage_messageIdHeader_key" ON "OutreachMessage"("messageIdHeader");

