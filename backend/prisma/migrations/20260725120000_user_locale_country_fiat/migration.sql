-- AlterTable
ALTER TABLE "User" ADD COLUMN "countryCode" TEXT,
ADD COLUMN "preferredFiat" TEXT,
ADD COLUMN "preferredAsset" TEXT DEFAULT 'USDT',
ADD COLUMN "locale" TEXT;
