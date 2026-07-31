-- Binary options (Binomo-style)

CREATE TYPE "BinaryDirection" AS ENUM ('UP', 'DOWN');
CREATE TYPE "BinaryTradeStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'CANCELLED');
CREATE TYPE "BinaryOutcomeMode" AS ENUM ('RANDOM', 'WIN', 'LOSE');

ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'BINARY_OPEN';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'BINARY_WIN';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'BINARY_TRADE';

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "tradingCurrency" TEXT NOT NULL DEFAULT 'KZT';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "outcomeMode" "BinaryOutcomeMode" NOT NULL DEFAULT 'RANDOM';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "loggingEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "pendingWithdraw" DECIMAL(30,10) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS "BinaryTrade" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "pairId" TEXT NOT NULL,
    "direction" "BinaryDirection" NOT NULL,
    "stake" DECIMAL(30,10) NOT NULL,
    "currency" TEXT NOT NULL,
    "entryPrice" DECIMAL(30,10) NOT NULL,
    "exitPrice" DECIMAL(30,10),
    "payout" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "payoutCoef" DECIMAL(10,4) NOT NULL,
    "status" "BinaryTradeStatus" NOT NULL DEFAULT 'OPEN',
    "durationSec" INTEGER NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BinaryTrade_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "ActionLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ActionLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "BinaryTrade_userId_status_idx" ON "BinaryTrade"("userId", "status");
CREATE INDEX IF NOT EXISTS "BinaryTrade_status_createdAt_idx" ON "BinaryTrade"("status", "createdAt");
CREATE INDEX IF NOT EXISTS "BinaryTrade_pairId_idx" ON "BinaryTrade"("pairId");
CREATE INDEX IF NOT EXISTS "ActionLog_userId_createdAt_idx" ON "ActionLog"("userId", "createdAt");

ALTER TABLE "BinaryTrade" DROP CONSTRAINT IF EXISTS "BinaryTrade_userId_fkey";
ALTER TABLE "BinaryTrade" ADD CONSTRAINT "BinaryTrade_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ActionLog" DROP CONSTRAINT IF EXISTS "ActionLog_userId_fkey";
ALTER TABLE "ActionLog" ADD CONSTRAINT "ActionLog_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
VALUES ('binary_payout_coefficient', '1.96', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;

INSERT INTO "SystemSetting" ("key", "value", "updatedAt")
VALUES ('deposit_requisites', 'Реквизиты не заданы. Обратитесь в поддержку.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
