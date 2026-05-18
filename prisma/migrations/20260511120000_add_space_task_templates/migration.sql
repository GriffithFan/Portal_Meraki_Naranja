-- Add per-space task template configuration.
ALTER TABLE "EspacioTrabajo"
ADD COLUMN "camposConfig" JSONB,
ADD COLUMN "estadosConfig" JSONB;
