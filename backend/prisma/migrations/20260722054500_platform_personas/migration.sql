-- Platform persona model: synthetic P2P counterparties backed by house
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isPersona" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personaRating" DECIMAL(5,4);
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "personaDealsCount" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "Advertisement" ADD COLUMN IF NOT EXISTS "isPlatform" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Advertisement_isPlatform_status_idx" ON "Advertisement"("isPlatform", "status");
