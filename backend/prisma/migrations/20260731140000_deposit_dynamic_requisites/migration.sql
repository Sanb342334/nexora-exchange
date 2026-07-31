-- Per-request deposit requisites (admin assigns when request arrives)
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "requisites" TEXT;
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "requisitesAssignedAt" TIMESTAMP(3);
ALTER TABLE "DepositRequest" ADD COLUMN IF NOT EXISTS "paymentExpiresAt" TIMESTAMP(3);
