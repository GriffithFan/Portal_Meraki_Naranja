-- Sync migration: DB was updated via db push, this migration records the changes
-- for migration history consistency.

-- AlterTable Instructivo: add video upload fields and text content
ALTER TABLE "Instructivo" ADD COLUMN IF NOT EXISTS "contenido" TEXT;
ALTER TABLE "Instructivo" ADD COLUMN IF NOT EXISTS "videoNombre" TEXT;
ALTER TABLE "Instructivo" ADD COLUMN IF NOT EXISTS "videoRuta" TEXT;
ALTER TABLE "Instructivo" ADD COLUMN IF NOT EXISTS "videoSize" INTEGER;
ALTER TABLE "Instructivo" ADD COLUMN IF NOT EXISTS "videoTipo" TEXT;
ALTER TABLE "Instructivo" ALTER COLUMN "videoUrl" DROP NOT NULL;

-- Create missing indexes
CREATE INDEX IF NOT EXISTS "Actividad_userId_idx" ON "Actividad"("userId");
CREATE INDEX IF NOT EXISTS "Actividad_entidad_idx" ON "Actividad"("entidad");
CREATE INDEX IF NOT EXISTS "Actividad_createdAt_idx" ON "Actividad"("createdAt");
CREATE INDEX IF NOT EXISTS "Asignacion_userId_idx" ON "Asignacion"("userId");
CREATE INDEX IF NOT EXISTS "Asignacion_predioId_idx" ON "Asignacion"("predioId");
CREATE INDEX IF NOT EXISTS "Comentario_predioId_idx" ON "Comentario"("predioId");
CREATE INDEX IF NOT EXISTS "Comentario_equipoId_idx" ON "Comentario"("equipoId");
CREATE INDEX IF NOT EXISTS "Notificacion_userId_leida_idx" ON "Notificacion"("userId", "leida");
CREATE INDEX IF NOT EXISTS "Notificacion_createdAt_idx" ON "Notificacion"("createdAt");
CREATE INDEX IF NOT EXISTS "TareaCalendario_fecha_idx" ON "TareaCalendario"("fecha");
CREATE INDEX IF NOT EXISTS "TareaCalendario_asignadoId_idx" ON "TareaCalendario"("asignadoId");
CREATE INDEX IF NOT EXISTS "TareaCalendario_creadorId_idx" ON "TareaCalendario"("creadorId");
