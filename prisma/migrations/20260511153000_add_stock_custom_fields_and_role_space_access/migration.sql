-- Add stock dynamic fields and role-based space access
ALTER TABLE "Equipo" ADD COLUMN IF NOT EXISTS "camposExtra" JSONB;

CREATE TABLE IF NOT EXISTS "AccesoEspacioRol" (
    "id" TEXT NOT NULL,
    "rol" "Role" NOT NULL,
    "espacioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoEspacioRol_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AccesoEspacioRol_rol_espacioId_key" ON "AccesoEspacioRol"("rol", "espacioId");
CREATE INDEX IF NOT EXISTS "AccesoEspacioRol_rol_idx" ON "AccesoEspacioRol"("rol");
CREATE INDEX IF NOT EXISTS "AccesoEspacioRol_espacioId_idx" ON "AccesoEspacioRol"("espacioId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.table_constraints
        WHERE constraint_name = 'AccesoEspacioRol_espacioId_fkey'
          AND table_name = 'AccesoEspacioRol'
    ) THEN
        ALTER TABLE "AccesoEspacioRol"
            ADD CONSTRAINT "AccesoEspacioRol_espacioId_fkey"
            FOREIGN KEY ("espacioId") REFERENCES "EspacioTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
