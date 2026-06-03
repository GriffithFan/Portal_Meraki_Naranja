DROP INDEX IF EXISTS "Predio_equipoAsignado_idx";
DROP INDEX IF EXISTS "Predio_equipoAsignado_updatedAt_idx";

ALTER TABLE "Predio" DROP COLUMN IF EXISTS "equipoAsignado";