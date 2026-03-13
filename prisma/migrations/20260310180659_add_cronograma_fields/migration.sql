-- AlterTable
ALTER TABLE "Predio" ADD COLUMN     "ambito" TEXT,
ADD COLUMN     "camposExtra" JSONB,
ADD COLUMN     "cue" TEXT,
ADD COLUMN     "cuePredio" TEXT,
ADD COLUMN     "equipoAsignado" TEXT,
ADD COLUMN     "fechaActualizacion" TIMESTAMP(3),
ADD COLUMN     "fechaDesde" TIMESTAMP(3),
ADD COLUMN     "fechaHasta" TIMESTAMP(3),
ADD COLUMN     "gpsPredio" TEXT,
ADD COLUMN     "incidencias" TEXT,
ADD COLUMN     "lacR" TEXT,
ADD COLUMN     "provincia" TEXT;

-- CreateIndex
CREATE INDEX "Predio_provincia_idx" ON "Predio"("provincia");

-- CreateIndex
CREATE INDEX "Predio_equipoAsignado_idx" ON "Predio"("equipoAsignado");
