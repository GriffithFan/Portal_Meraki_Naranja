-- AlterTable: add read receipt timestamps to ChatConversacion
ALTER TABLE "ChatConversacion" ADD COLUMN "leidoPorCreadorAt" TIMESTAMP(3);
ALTER TABLE "ChatConversacion" ADD COLUMN "leidoPorMesaAt" TIMESTAMP(3);

-- AlterTable: add editadoAt to ChatMensaje
ALTER TABLE "ChatMensaje" ADD COLUMN "editadoAt" TIMESTAMP(3);
