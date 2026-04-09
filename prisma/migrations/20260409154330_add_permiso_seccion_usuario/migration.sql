-- CreateTable
CREATE TABLE "PermisoSeccionUsuario" (
    "id" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ver" BOOLEAN NOT NULL DEFAULT true,
    "crear" BOOLEAN NOT NULL DEFAULT false,
    "editar" BOOLEAN NOT NULL DEFAULT false,
    "eliminar" BOOLEAN NOT NULL DEFAULT false,
    "exportar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PermisoSeccionUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PermisoSeccionUsuario_userId_idx" ON "PermisoSeccionUsuario"("userId");

-- CreateIndex
CREATE INDEX "PermisoSeccionUsuario_seccion_idx" ON "PermisoSeccionUsuario"("seccion");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoSeccionUsuario_seccion_userId_key" ON "PermisoSeccionUsuario"("seccion", "userId");

-- AddForeignKey
ALTER TABLE "PermisoSeccionUsuario" ADD CONSTRAINT "PermisoSeccionUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
