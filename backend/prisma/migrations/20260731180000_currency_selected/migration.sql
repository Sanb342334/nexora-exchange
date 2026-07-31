-- AlterTable
ALTER TABLE "User" ADD COLUMN "currencySelected" BOOLEAN NOT NULL DEFAULT false;

-- Existing accounts already have a currency — don't force the picker again
UPDATE "User" SET "currencySelected" = true;
