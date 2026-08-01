-- Mini App auth identity
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "telegramId" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "User_telegramId_key" ON "User"("telegramId");
