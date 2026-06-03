-- Add message update tracking for incremental chat refreshes.
ALTER TABLE "ChatMensaje" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Store one active quick reaction per user/message.
CREATE TABLE "ChatMensajeReaction" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChatMensajeReaction_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ChatMensajeReaction_mensajeId_userId_key" ON "ChatMensajeReaction"("mensajeId", "userId");
CREATE INDEX "ChatMensajeReaction_mensajeId_idx" ON "ChatMensajeReaction"("mensajeId");
CREATE INDEX "ChatMensajeReaction_userId_idx" ON "ChatMensajeReaction"("userId");

ALTER TABLE "ChatMensajeReaction" ADD CONSTRAINT "ChatMensajeReaction_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "ChatMensaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChatMensajeReaction" ADD CONSTRAINT "ChatMensajeReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
