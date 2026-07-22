-- OTC dealer workflow fields
CREATE TYPE "OtcStage" AS ENUM ('NEW', 'ORDER_FOUND', 'EXECUTING', 'PAYMENT_CONFIRMED', 'USDT_SENT', 'COMPLETED');

ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "city" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "assignedOperatorId" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "takenAt" TIMESTAMP(3);
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "otcStage" "OtcStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "externalOrderUrl" TEXT;
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "externalBuyPrice" DECIMAL(30,10);
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "externalSellPrice" DECIMAL(30,10);
ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "expectedProfit" DECIMAL(30,10);

ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "buyerAlias" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "sellerAlias" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "assignedOperatorId" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "takenAt" TIMESTAMP(3);
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "otcStage" "OtcStage" NOT NULL DEFAULT 'NEW';
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "externalOrderUrl" TEXT;
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "externalBuyPrice" DECIMAL(30,10);
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "externalSellPrice" DECIMAL(30,10);
ALTER TABLE "Deal" ADD COLUMN IF NOT EXISTS "expectedProfit" DECIMAL(30,10);

ALTER TABLE "Advertisement" DROP CONSTRAINT IF EXISTS "Advertisement_assignedOperatorId_fkey";
ALTER TABLE "Advertisement" ADD CONSTRAINT "Advertisement_assignedOperatorId_fkey"
  FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Deal" DROP CONSTRAINT IF EXISTS "Deal_assignedOperatorId_fkey";
ALTER TABLE "Deal" ADD CONSTRAINT "Deal_assignedOperatorId_fkey"
  FOREIGN KEY ("assignedOperatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "Advertisement_assignedOperatorId_idx" ON "Advertisement"("assignedOperatorId");
CREATE INDEX IF NOT EXISTS "Advertisement_otcStage_idx" ON "Advertisement"("otcStage");
CREATE INDEX IF NOT EXISTS "Deal_assignedOperatorId_idx" ON "Deal"("assignedOperatorId");
CREATE INDEX IF NOT EXISTS "Deal_otcStage_idx" ON "Deal"("otcStage");
