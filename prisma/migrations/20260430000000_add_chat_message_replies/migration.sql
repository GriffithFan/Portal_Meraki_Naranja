ALTER TABLE "ChatMensaje" ADD COLUMN "replyToId" TEXT;

ALTER TABLE "ChatMensaje" ADD CONSTRAINT "ChatMensaje_replyToId_fkey"
  FOREIGN KEY ("replyToId") REFERENCES "ChatMensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ChatMensaje_replyToId_idx" ON "ChatMensaje"("replyToId");