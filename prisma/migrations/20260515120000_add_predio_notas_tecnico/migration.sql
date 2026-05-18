-- Add technician-specific notes to tasks/predios
ALTER TABLE "Predio" ADD COLUMN IF NOT EXISTS "notasTecnico" TEXT;
