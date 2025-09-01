-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "public"."events" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "source" TEXT NOT NULL,
    "url" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "type" TEXT NOT NULL,
    "extractedLocation" TEXT,
    "googleMapsUrl" TEXT,
    "originalCreatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."geocode_cache" (
    "id" SERIAL NOT NULL,
    "locationText" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "formattedAddress" TEXT,
    "source" TEXT NOT NULL,
    "confidenceScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "usageCount" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "geocode_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."warning_markers" (
    "id" SERIAL NOT NULL,
    "tweetId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "bookmarks" INTEGER NOT NULL DEFAULT 0,
    "favorites" INTEGER NOT NULL DEFAULT 0,
    "retweets" INTEGER NOT NULL DEFAULT 0,
    "views" TEXT NOT NULL DEFAULT '0',
    "quotes" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "userInfo" JSONB NOT NULL,
    "extractedLocation" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "confidenceScore" DOUBLE PRECISION,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warning_markers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "events_url_key" ON "public"."events"("url");

-- CreateIndex
CREATE INDEX "idx_events_createdAt" ON "public"."events"("createdAt");

-- CreateIndex
CREATE INDEX "idx_events_type" ON "public"."events"("type");

-- CreateIndex
CREATE INDEX "idx_events_createdAt_type" ON "public"."events"("createdAt", "type");

-- CreateIndex
CREATE UNIQUE INDEX "geocode_cache_locationText_key" ON "public"."geocode_cache"("locationText");

-- CreateIndex
CREATE UNIQUE INDEX "warning_markers_tweetId_key" ON "public"."warning_markers"("tweetId");

-- CreateIndex
CREATE INDEX "idx_warning_markers_createdAt" ON "public"."warning_markers"("createdAt");

