-- Spot trading tables
CREATE TYPE "SpotOrderSide" AS ENUM ('BUY', 'SELL');
CREATE TYPE "SpotOrderType" AS ENUM ('MARKET', 'LIMIT');
CREATE TYPE "SpotOrderStatus" AS ENUM ('OPEN', 'PARTIALLY_FILLED', 'FILLED', 'CANCELLED', 'REJECTED');

ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'SPOT_LOCK';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'SPOT_UNLOCK';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'SPOT_FILL';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'SPOT_FEE';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPOT_ORDER';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SPOT_TRADE';

CREATE TABLE "SpotOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "side" "SpotOrderSide" NOT NULL,
    "type" "SpotOrderType" NOT NULL,
    "status" "SpotOrderStatus" NOT NULL DEFAULT 'OPEN',
    "price" DECIMAL(30,10),
    "quantity" DECIMAL(30,10) NOT NULL,
    "filledQty" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "lockCurrency" TEXT NOT NULL,
    "lockAmount" DECIMAL(30,10) NOT NULL,
    "lockedRemaining" DECIMAL(30,10) NOT NULL,
    "avgFillPrice" DECIMAL(30,10),
    "feeAmount" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "feeCurrency" TEXT,
    "clientOrderId" TEXT NOT NULL,
    "rejectReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "filledAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    CONSTRAINT "SpotOrder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SpotTrade" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" "SpotOrderSide" NOT NULL,
    "price" DECIMAL(30,10) NOT NULL,
    "quantity" DECIMAL(30,10) NOT NULL,
    "quoteAmount" DECIMAL(30,10) NOT NULL,
    "feeAmount" DECIMAL(30,10) NOT NULL,
    "feeCurrency" TEXT NOT NULL,
    "ledgerTxId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SpotTrade_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SpotOrder_userId_clientOrderId_key" ON "SpotOrder"("userId", "clientOrderId");
CREATE INDEX "SpotOrder_symbol_status_idx" ON "SpotOrder"("symbol", "status");
CREATE INDEX "SpotOrder_userId_status_idx" ON "SpotOrder"("userId", "status");
CREATE INDEX "SpotTrade_symbol_createdAt_idx" ON "SpotTrade"("symbol", "createdAt");
CREATE INDEX "SpotTrade_userId_createdAt_idx" ON "SpotTrade"("userId", "createdAt");
CREATE INDEX "SpotTrade_orderId_idx" ON "SpotTrade"("orderId");

ALTER TABLE "SpotOrder" ADD CONSTRAINT "SpotOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SpotTrade" ADD CONSTRAINT "SpotTrade_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "SpotOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
