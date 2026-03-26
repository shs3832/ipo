-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AlertType" AS ENUM ('CLOSING_DAY_ANALYSIS');

-- CreateEnum
CREATE TYPE "public"."ChannelType" AS ENUM ('EMAIL', 'TELEGRAM');

-- CreateEnum
CREATE TYPE "public"."DeliveryStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "public"."InviteState" AS ENUM ('INTERNAL', 'INVITED', 'ACCEPTED', 'REVOKED');

-- CreateEnum
CREATE TYPE "public"."IpoEventType" AS ENUM ('SUBSCRIPTION', 'REFUND', 'LISTING');

-- CreateEnum
CREATE TYPE "public"."IpoStatus" AS ENUM ('UPCOMING', 'OPEN', 'CLOSED', 'LISTED', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "public"."JobStatus" AS ENUM ('READY', 'SENT', 'PARTIAL_FAILURE');

-- CreateEnum
CREATE TYPE "public"."RecipientStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateTable
CREATE TABLE "public"."AdminOverride" (
    "id" TEXT NOT NULL,
    "slug" TEXT,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdminOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ExternalDataCache" (
    "cacheKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalDataCache_pkey" PRIMARY KEY ("cacheKey")
);

-- CreateTable
CREATE TABLE "public"."Ipo" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "leadManager" TEXT,
    "coManagers" JSONB,
    "priceBandLow" INTEGER,
    "priceBandHigh" INTEGER,
    "offerPrice" INTEGER,
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "listingDate" TIMESTAMP(3),
    "status" "public"."IpoStatus" NOT NULL DEFAULT 'UPCOMING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "depositRate" DOUBLE PRECISION,
    "minimumSubscriptionShares" INTEGER,
    "kindIssueCode" TEXT,
    "listingOpenPrice" INTEGER,
    "listingOpenReturnRate" DOUBLE PRECISION,

    CONSTRAINT "Ipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IpoAnalysis" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "score" INTEGER NOT NULL,
    "ratingLabel" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "keyPoints" JSONB NOT NULL,
    "warnings" JSONB NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpoAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IpoEvent" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "type" "public"."IpoEventType" NOT NULL,
    "title" TEXT NOT NULL,
    "eventDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpoEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."IpoSourceSnapshot" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IpoSourceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationDelivery" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "channelType" "public"."ChannelType" NOT NULL,
    "channelAddress" TEXT NOT NULL,
    "status" "public"."DeliveryStatus" NOT NULL DEFAULT 'PENDING',
    "providerMessageId" TEXT,
    "errorMessage" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "idempotencyKey" TEXT NOT NULL,

    CONSTRAINT "NotificationDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."NotificationJob" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "alertType" "public"."AlertType" NOT NULL,
    "scheduledFor" TIMESTAMP(3) NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "public"."JobStatus" NOT NULL DEFAULT 'READY',
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NotificationJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."OperationLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "context" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Recipient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "public"."RecipientStatus" NOT NULL DEFAULT 'ACTIVE',
    "inviteState" "public"."InviteState" NOT NULL DEFAULT 'INTERNAL',
    "consentedAt" TIMESTAMP(3),
    "unsubscribedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Recipient_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RecipientChannel" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "type" "public"."ChannelType" NOT NULL,
    "address" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecipientChannel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Subscription" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "alertType" "public"."AlertType" NOT NULL,
    "scope" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExternalDataCache_expiresAt_idx" ON "public"."ExternalDataCache"("expiresAt" ASC);

-- CreateIndex
CREATE INDEX "ExternalDataCache_source_expiresAt_idx" ON "public"."ExternalDataCache"("source" ASC, "expiresAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Ipo_slug_key" ON "public"."Ipo"("slug" ASC);

-- CreateIndex
CREATE INDEX "IpoAnalysis_ipoId_generatedAt_idx" ON "public"."IpoAnalysis"("ipoId" ASC, "generatedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "IpoEvent_ipoId_type_eventDate_key" ON "public"."IpoEvent"("ipoId" ASC, "type" ASC, "eventDate" ASC);

-- CreateIndex
CREATE INDEX "IpoSourceSnapshot_ipoId_fetchedAt_idx" ON "public"."IpoSourceSnapshot"("ipoId" ASC, "fetchedAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationDelivery_idempotencyKey_key" ON "public"."NotificationDelivery"("idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "NotificationDelivery_jobId_recipientId_channelType_idx" ON "public"."NotificationDelivery"("jobId" ASC, "recipientId" ASC, "channelType" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "NotificationJob_idempotencyKey_key" ON "public"."NotificationJob"("idempotencyKey" ASC);

-- CreateIndex
CREATE INDEX "NotificationJob_scheduledFor_status_idx" ON "public"."NotificationJob"("scheduledFor" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "OperationLog_createdAt_idx" ON "public"."OperationLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "OperationLog_level_createdAt_idx" ON "public"."OperationLog"("level" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "OperationLog_source_createdAt_idx" ON "public"."OperationLog"("source" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "RecipientChannel_recipientId_type_address_key" ON "public"."RecipientChannel"("recipientId" ASC, "type" ASC, "address" ASC);

-- CreateIndex
CREATE INDEX "Subscription_recipientId_alertType_idx" ON "public"."Subscription"("recipientId" ASC, "alertType" ASC);

-- AddForeignKey
ALTER TABLE "public"."IpoAnalysis" ADD CONSTRAINT "IpoAnalysis_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "public"."Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IpoEvent" ADD CONSTRAINT "IpoEvent_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "public"."Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IpoSourceSnapshot" ADD CONSTRAINT "IpoSourceSnapshot_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "public"."Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."NotificationJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationDelivery" ADD CONSTRAINT "NotificationDelivery_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."NotificationJob" ADD CONSTRAINT "NotificationJob_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "public"."Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."RecipientChannel" ADD CONSTRAINT "RecipientChannel_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Subscription" ADD CONSTRAINT "Subscription_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "public"."Recipient"("id") ON DELETE CASCADE ON UPDATE CASCADE;

