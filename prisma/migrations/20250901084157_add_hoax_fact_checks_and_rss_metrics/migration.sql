-- CreateTable
CREATE TABLE "public"."hoax_fact_checks" (
    "id" TEXT NOT NULL,
    "rssGuid" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "originalClaim" TEXT,
    "hoaxCategory" TEXT NOT NULL,
    "verificationMethod" TEXT,
    "investigationResult" TEXT,
    "authorName" TEXT,
    "sourceUrl" TEXT NOT NULL,
    "publicationDate" TIMESTAMP(3) NOT NULL,
    "contentHash" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "embedding" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hoax_fact_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."rss_metrics" (
    "id" SERIAL NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "successRate" DOUBLE PRECISION NOT NULL,
    "responseTime" INTEGER NOT NULL,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "newItemsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rss_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "hoax_fact_checks_rssGuid_key" ON "public"."hoax_fact_checks"("rssGuid");

-- CreateIndex
CREATE UNIQUE INDEX "hoax_fact_checks_sourceUrl_key" ON "public"."hoax_fact_checks"("sourceUrl");

-- CreateIndex
CREATE INDEX "idx_hoax_category" ON "public"."hoax_fact_checks"("hoaxCategory");

-- CreateIndex
CREATE INDEX "idx_hoax_publication_date" ON "public"."hoax_fact_checks"("publicationDate");

-- CreateIndex
CREATE INDEX "idx_hoax_active" ON "public"."hoax_fact_checks"("isActive");

-- CreateIndex
CREATE INDEX "idx_hoax_guid" ON "public"."hoax_fact_checks"("rssGuid");

-- CreateIndex
CREATE INDEX "idx_rss_metrics_timestamp" ON "public"."rss_metrics"("timestamp");
