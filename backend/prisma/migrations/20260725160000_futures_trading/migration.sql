-- Futures positions (USDT-margined isolated perp MVP)

CREATE TYPE "FuturesPositionSide" AS ENUM ('LONG', 'SHORT');
CREATE TYPE "FuturesPositionStatus" AS ENUM ('OPEN', 'CLOSED', 'LIQUIDATED');

ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'FUTURES_LOCK';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'FUTURES_UNLOCK';
ALTER TYPE "LedgerTxType" ADD VALUE IF NOT EXISTS 'FUTURES_PNL';

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'FUTURES_POSITION';

CREATE TABLE "FuturesPosition" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "base" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "side" "FuturesPositionSide" NOT NULL,
    "leverage" INTEGER NOT NULL,
    "entryPrice" DECIMAL(30,10) NOT NULL,
    "quantity" DECIMAL(30,10) NOT NULL,
    "margin" DECIMAL(30,10) NOT NULL,
    "liquidationPrice" DECIMAL(30,10) NOT NULL,
    "status" "FuturesPositionStatus" NOT NULL DEFAULT 'OPEN',
    "closePrice" DECIMAL(30,10),
    "realizedPnl" DECIMAL(30,10) NOT NULL DEFAULT 0,
    "clientOrderId" TEXT NOT NULL,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FuturesPosition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "FuturesPosition_userId_clientOrderId_key" ON "FuturesPosition"("userId", "clientOrderId");
CREATE INDEX "FuturesPosition_userId_status_idx" ON "FuturesPosition"("userId", "status");
CREATE INDEX "FuturesPosition_symbol_status_idx" ON "FuturesPosition"("symbol", "status");

ALTER TABLE "FuturesPosition" ADD CONSTRAINT "FuturesPosition_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
