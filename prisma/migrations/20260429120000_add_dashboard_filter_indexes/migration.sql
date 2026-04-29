-- Indexes for task dashboard filters, pagination and stock catalog views.
CREATE INDEX IF NOT EXISTS "Predio_updatedAt_idx" ON "Predio"("updatedAt");
CREATE INDEX IF NOT EXISTS "Predio_prioridad_updatedAt_idx" ON "Predio"("prioridad", "updatedAt");
CREATE INDEX IF NOT EXISTS "Predio_provincia_updatedAt_idx" ON "Predio"("provincia", "updatedAt");
CREATE INDEX IF NOT EXISTS "Predio_equipoAsignado_updatedAt_idx" ON "Predio"("equipoAsignado", "updatedAt");
CREATE INDEX IF NOT EXISTS "Predio_espacioId_updatedAt_idx" ON "Predio"("espacioId", "updatedAt");
CREATE INDEX IF NOT EXISTS "Predio_fechaHasta_idx" ON "Predio"("fechaHasta");
CREATE INDEX IF NOT EXISTS "Predio_fechaProgramada_idx" ON "Predio"("fechaProgramada");
CREATE INDEX IF NOT EXISTS "Predio_estadoId_updatedAt_idx" ON "Predio"("estadoId", "updatedAt");

CREATE INDEX IF NOT EXISTS "Equipo_updatedAt_idx" ON "Equipo"("updatedAt");
CREATE INDEX IF NOT EXISTS "Equipo_estado_updatedAt_idx" ON "Equipo"("estado", "updatedAt");
CREATE INDEX IF NOT EXISTS "Equipo_categoria_updatedAt_idx" ON "Equipo"("categoria", "updatedAt");
