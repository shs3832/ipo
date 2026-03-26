-- CreateEnum
CREATE TYPE "IpoFactSourceType" AS ENUM ('OPENDART', 'KIND', 'SEIBRO', 'KRX', 'BROKER', 'INTERNAL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ScoreSnapshotStatus" AS ENUM ('NOT_READY', 'PARTIAL', 'READY', 'STALE');

-- CreateEnum
CREATE TYPE "ScoreCoverageStatus" AS ENUM ('EMPTY', 'PARTIAL', 'SUFFICIENT');

-- CreateEnum
CREATE TYPE "ScoreQueueStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "ScoreRecalcReason" AS ENUM ('DAILY_AUDIT', 'SOURCE_REFRESH', 'MANUAL');

-- CreateTable
CREATE TABLE "ipo_master" (
    "id" TEXT NOT NULL,
    "legacyIpoId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "issuerName" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "corpCode" TEXT,
    "stockCode" TEXT,
    "kindIssueCode" TEXT,
    "kindBizProcessNo" TEXT,
    "leadManager" TEXT,
    "coManagers" JSONB,
    "priceBandLow" INTEGER,
    "priceBandHigh" INTEGER,
    "offerPrice" INTEGER,
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "refundDate" TIMESTAMP(3),
    "listingDate" TIMESTAMP(3),
    "status" "IpoStatus" NOT NULL DEFAULT 'UPCOMING',
    "latestDisclosureNo" TEXT,
    "sourcePriorityVersion" TEXT,
    "lastSourceSeenAt" TIMESTAMP(3),
    "lastFactRefreshedAt" TIMESTAMP(3),
    "lastScoreCalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_master_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_supply" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "sourceType" "IpoFactSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRef" TEXT,
    "asOfDate" TIMESTAMP(3),
    "totalOfferedShares" BIGINT,
    "newShares" BIGINT,
    "secondaryShares" BIGINT,
    "listedShares" BIGINT,
    "tradableShares" BIGINT,
    "floatRatio" DOUBLE PRECISION,
    "insiderSalesRatio" DOUBLE PRECISION,
    "lockupConfirmedShares" BIGINT,
    "lockupRatio" DOUBLE PRECISION,
    "lockupDetailJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "checksum" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_supply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_demand" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "sourceType" "IpoFactSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRef" TEXT,
    "demandForecastStart" TIMESTAMP(3),
    "demandForecastEnd" TIMESTAMP(3),
    "institutionalCompetitionRate" DOUBLE PRECISION,
    "priceBandTopAcceptanceRatio" DOUBLE PRECISION,
    "priceBandExceedRatio" DOUBLE PRECISION,
    "participatingInstitutions" INTEGER,
    "orderQuantity" BIGINT,
    "bidDistributionJson" JSONB,
    "confidence" DOUBLE PRECISION,
    "checksum" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_demand_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_subscription" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "brokerName" TEXT NOT NULL,
    "brokerCode" TEXT,
    "sourceType" "IpoFactSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "sourceRef" TEXT,
    "subscriptionStart" TIMESTAMP(3),
    "subscriptionEnd" TIMESTAMP(3),
    "generalCompetitionRate" DOUBLE PRECISION,
    "allocatedShares" BIGINT,
    "equalAllocatedShares" BIGINT,
    "proportionalAllocatedShares" BIGINT,
    "minimumSubscriptionShares" INTEGER,
    "maximumSubscriptionShares" INTEGER,
    "depositRate" DOUBLE PRECISION,
    "subscriptionFee" INTEGER,
    "hasOnlineOnlyCondition" BOOLEAN NOT NULL DEFAULT false,
    "confidence" DOUBLE PRECISION,
    "checksum" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_subscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_market_perf" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "sourceType" "IpoFactSourceType" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "asOfDate" TIMESTAMP(3),
    "listingOpenPrice" INTEGER,
    "listingOpenReturnRate" DOUBLE PRECISION,
    "day1ClosePrice" INTEGER,
    "day1CloseReturnRate" DOUBLE PRECISION,
    "week1ReturnRate" DOUBLE PRECISION,
    "month1ReturnRate" DOUBLE PRECISION,
    "kospiReturnSameWindow" DOUBLE PRECISION,
    "kosdaqReturnSameWindow" DOUBLE PRECISION,
    "sectorReturnSameWindow" DOUBLE PRECISION,
    "recentIpoHeatScore" DOUBLE PRECISION,
    "checksum" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_market_perf_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "issuer_financials" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "corpCode" TEXT,
    "reportReceiptNo" TEXT,
    "reportCode" TEXT,
    "reportLabel" TEXT NOT NULL,
    "statementType" TEXT,
    "fiscalYear" INTEGER,
    "fiscalPeriod" TEXT,
    "revenue" BIGINT,
    "previousRevenue" BIGINT,
    "revenueGrowthRate" DOUBLE PRECISION,
    "operatingIncome" BIGINT,
    "previousOperatingIncome" BIGINT,
    "operatingMarginRate" DOUBLE PRECISION,
    "netIncome" BIGINT,
    "previousNetIncome" BIGINT,
    "totalAssets" BIGINT,
    "totalLiabilities" BIGINT,
    "totalEquity" BIGINT,
    "debtRatio" DOUBLE PRECISION,
    "sourceKey" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "isLatest" BOOLEAN NOT NULL DEFAULT true,
    "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "issuer_financials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_score_snapshot" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "scoreVersion" TEXT NOT NULL,
    "status" "ScoreSnapshotStatus" NOT NULL,
    "coverageStatus" "ScoreCoverageStatus" NOT NULL,
    "supplyScore" DOUBLE PRECISION,
    "lockupScore" DOUBLE PRECISION,
    "competitionScore" DOUBLE PRECISION,
    "marketScore" DOUBLE PRECISION,
    "financialAdjustmentScore" DOUBLE PRECISION,
    "totalScore" DOUBLE PRECISION,
    "componentWeights" JSONB,
    "inputsChecksum" TEXT NOT NULL,
    "evidenceSummary" JSONB,
    "warnings" JSONB,
    "explanations" JSONB,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ipo_score_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ipo_recalc_queue" (
    "id" TEXT NOT NULL,
    "ipoId" TEXT NOT NULL,
    "reason" "ScoreRecalcReason" NOT NULL,
    "triggerSource" TEXT NOT NULL,
    "triggerPayload" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "status" "ScoreQueueStatus" NOT NULL DEFAULT 'PENDING',
    "runAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ipo_recalc_queue_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ipo_master_legacyIpoId_key" ON "ipo_master"("legacyIpoId");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_master_slug_key" ON "ipo_master"("slug");

-- CreateIndex
CREATE INDEX "ipo_master_status_subscriptionEnd_idx" ON "ipo_master"("status", "subscriptionEnd");

-- CreateIndex
CREATE INDEX "ipo_supply_ipoId_isLatest_collectedAt_idx" ON "ipo_supply"("ipoId", "isLatest", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_supply_ipoId_sourceKey_checksum_key" ON "ipo_supply"("ipoId", "sourceKey", "checksum");

-- CreateIndex
CREATE INDEX "ipo_demand_ipoId_isLatest_collectedAt_idx" ON "ipo_demand"("ipoId", "isLatest", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_demand_ipoId_sourceKey_checksum_key" ON "ipo_demand"("ipoId", "sourceKey", "checksum");

-- CreateIndex
CREATE INDEX "ipo_subscription_ipoId_isLatest_collectedAt_idx" ON "ipo_subscription"("ipoId", "isLatest", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_subscription_ipoId_brokerName_sourceKey_checksum_key" ON "ipo_subscription"("ipoId", "brokerName", "sourceKey", "checksum");

-- CreateIndex
CREATE INDEX "ipo_market_perf_ipoId_isLatest_collectedAt_idx" ON "ipo_market_perf"("ipoId", "isLatest", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_market_perf_ipoId_sourceKey_checksum_key" ON "ipo_market_perf"("ipoId", "sourceKey", "checksum");

-- CreateIndex
CREATE INDEX "issuer_financials_ipoId_isLatest_collectedAt_idx" ON "issuer_financials"("ipoId", "isLatest", "collectedAt");

-- CreateIndex
CREATE UNIQUE INDEX "issuer_financials_ipoId_sourceKey_checksum_key" ON "issuer_financials"("ipoId", "sourceKey", "checksum");

-- CreateIndex
CREATE INDEX "ipo_score_snapshot_ipoId_calculatedAt_idx" ON "ipo_score_snapshot"("ipoId", "calculatedAt");

-- CreateIndex
CREATE INDEX "ipo_score_snapshot_ipoId_scoreVersion_calculatedAt_idx" ON "ipo_score_snapshot"("ipoId", "scoreVersion", "calculatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ipo_recalc_queue_dedupeKey_key" ON "ipo_recalc_queue"("dedupeKey");

-- CreateIndex
CREATE INDEX "ipo_recalc_queue_status_runAfter_idx" ON "ipo_recalc_queue"("status", "runAfter");

-- CreateIndex
CREATE INDEX "ipo_recalc_queue_ipoId_createdAt_idx" ON "ipo_recalc_queue"("ipoId", "createdAt");

-- AddForeignKey
ALTER TABLE "ipo_master" ADD CONSTRAINT "ipo_master_legacyIpoId_fkey" FOREIGN KEY ("legacyIpoId") REFERENCES "Ipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_supply" ADD CONSTRAINT "ipo_supply_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_demand" ADD CONSTRAINT "ipo_demand_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_subscription" ADD CONSTRAINT "ipo_subscription_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_market_perf" ADD CONSTRAINT "ipo_market_perf_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "issuer_financials" ADD CONSTRAINT "issuer_financials_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_score_snapshot" ADD CONSTRAINT "ipo_score_snapshot_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ipo_recalc_queue" ADD CONSTRAINT "ipo_recalc_queue_ipoId_fkey" FOREIGN KEY ("ipoId") REFERENCES "ipo_master"("id") ON DELETE CASCADE ON UPDATE CASCADE;

