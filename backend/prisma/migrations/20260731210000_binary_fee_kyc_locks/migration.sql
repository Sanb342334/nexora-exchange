-- Sync schema drift: binary trade fee/leverage fields + KYC + trade locks

-- BinaryTrade columns added after initial binary migration
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "fee" DECIMAL(30,10) NOT NULL DEFAULT 0;
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "leverage" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "takeProfit" DECIMAL(30,10);
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "stopLoss" DECIMAL(30,10);
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "realizedPnl" DECIMAL(30,10) NOT NULL DEFAULT 0;
ALTER TABLE "BinaryTrade" ADD COLUMN IF NOT EXISTS "closeReason" TEXT;

-- User trading / KYC / withdraw gates
DO $$ BEGIN
  CREATE TYPE "KycStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tradeLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycRequired" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycStatus" "KycStatus" NOT NULL DEFAULT 'NONE';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "kycRejectReason" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "withdrawRequireCardDeposit" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "currencySelected" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "KycSubmission" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "passportPage1Url" TEXT NOT NULL,
    "passportPage2Url" TEXT NOT NULL,
    "selfieUrl" TEXT NOT NULL,
    "status" "KycStatus" NOT NULL DEFAULT 'PENDING',
    "reviewNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "KycSubmission_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "KycSubmission_userId_status_idx" ON "KycSubmission"("userId", "status");
CREATE INDEX IF NOT EXISTS "KycSubmission_status_createdAt_idx" ON "KycSubmission"("status", "createdAt");

ALTER TABLE "KycSubmission" DROP CONSTRAINT IF EXISTS "KycSubmission_userId_fkey";
ALTER TABLE "KycSubmission" ADD CONSTRAINT "KycSubmission_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
