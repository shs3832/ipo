-- AlterEnum
ALTER TYPE "public"."ChannelType" ADD VALUE IF NOT EXISTS 'WEB_PUSH';

-- CreateTable
CREATE TABLE "public"."NotificationPreference" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "alertType" "public"."AlertType" NOT NULL,
    "channelType" "public"."ChannelType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationPreference_recipientId_alertType_channelType_key" ON "public"."NotificationPreference"("recipientId", "alertType", "channelType");

-- CreateIndex
CREATE INDEX "NotificationPreference_recipientId_alertType_idx" ON "public"."NotificationPreference"("recipientId", "alertType");

-- AddForeignKey
ALTER TABLE "public"."NotificationPreference" ADD CONSTRAINT "NotificationPreference_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
