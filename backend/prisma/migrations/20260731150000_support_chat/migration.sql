-- In-platform support chat
CREATE TYPE "SupportTicketStatus" AS ENUM ('OPEN', 'CLOSED');

CREATE TABLE IF NOT EXISTS "SupportTicket" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "subject" TEXT NOT NULL DEFAULT 'Поддержка',
  "status" "SupportTicketStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "SupportMessage" (
  "id" TEXT NOT NULL,
  "ticketId" TEXT NOT NULL,
  "senderId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "isStaff" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "SupportTicket_userId_status_idx" ON "SupportTicket"("userId", "status");
CREATE INDEX IF NOT EXISTS "SupportTicket_status_updatedAt_idx" ON "SupportTicket"("status", "updatedAt");
CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_createdAt_idx" ON "SupportMessage"("ticketId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
    FOREIGN KEY ("ticketId") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SupportMessage" ADD CONSTRAINT "SupportMessage_senderId_fkey"
    FOREIGN KEY ("senderId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
