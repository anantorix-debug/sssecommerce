-- CreateEnum
CREATE TYPE "MediaImportSource" AS ENUM ('CSV', 'ZIP', 'MANUAL');

-- CreateEnum
CREATE TYPE "MediaImportJobStatus" AS ENUM ('PROCESSING', 'REVIEW', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "MediaImportItemStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'READY', 'DUPLICATE', 'FAILED', 'APPROVED', 'REJECTED');

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "contentHash" TEXT;

-- CreateTable
CREATE TABLE "MediaImportJob" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" "MediaImportSource" NOT NULL,
    "status" "MediaImportJobStatus" NOT NULL DEFAULT 'PROCESSING',
    "licenceSource" TEXT NOT NULL,
    "licenceNote" TEXT NOT NULL,
    "licenceConfirmed" BOOLEAN NOT NULL,
    "createdById" TEXT,
    "createdByEmail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MediaImportJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MediaImportItem" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "rowNumber" INTEGER NOT NULL,
    "sku" TEXT,
    "productId" TEXT,
    "sourceUrl" TEXT,
    "fileName" TEXT,
    "stagedKey" TEXT,
    "role" "MediaRole" NOT NULL DEFAULT 'GALLERY',
    "position" INTEGER,
    "altText" TEXT,
    "status" "MediaImportItemStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lastError" TEXT,
    "contentHash" TEXT,
    "mediaId" TEXT,
    "duplicateOfMediaId" TEXT,
    "reviewedByEmail" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MediaImportItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MediaImportJob_createdAt_idx" ON "MediaImportJob"("createdAt");

-- CreateIndex
CREATE INDEX "MediaImportItem_jobId_idx" ON "MediaImportItem"("jobId");

-- CreateIndex
CREATE INDEX "MediaImportItem_status_nextAttemptAt_idx" ON "MediaImportItem"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MediaImportItem_contentHash_idx" ON "MediaImportItem"("contentHash");

-- CreateIndex
CREATE INDEX "MediaAsset_contentHash_idx" ON "MediaAsset"("contentHash");

-- AddForeignKey
ALTER TABLE "MediaImportItem" ADD CONSTRAINT "MediaImportItem_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "MediaImportJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImportItem" ADD CONSTRAINT "MediaImportItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaImportItem" ADD CONSTRAINT "MediaImportItem_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "MediaAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
