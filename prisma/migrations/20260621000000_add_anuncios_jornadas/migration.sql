-- CreateTable
CREATE TABLE "Anuncio" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "fijado" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notificar" BOOLEAN NOT NULL DEFAULT true,
    "intervaloHoras" INTEGER NOT NULL DEFAULT 1,
    "ultimaNotificacion" TIMESTAMP(3),
    "fechaExpiracion" TIMESTAMP(3),
    "autorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anuncio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnuncioLectura" (
    "id" TEXT NOT NULL,
    "anuncioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnuncioLectura_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JornadaLaboral" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "inicio" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fin" TIMESTAMP(3),
    "notaInicio" TEXT,
    "notaFin" TEXT,
    "latInicio" DOUBLE PRECISION,
    "lngInicio" DOUBLE PRECISION,
    "latFin" DOUBLE PRECISION,
    "lngFin" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JornadaLaboral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Anuncio_activo_fijado_createdAt_idx" ON "Anuncio"("activo", "fijado", "createdAt");

-- CreateIndex
CREATE INDEX "Anuncio_activo_notificar_idx" ON "Anuncio"("activo", "notificar");

-- CreateIndex
CREATE INDEX "Anuncio_autorId_idx" ON "Anuncio"("autorId");

-- CreateIndex
CREATE INDEX "AnuncioLectura_userId_idx" ON "AnuncioLectura"("userId");

-- CreateIndex
CREATE INDEX "AnuncioLectura_anuncioId_idx" ON "AnuncioLectura"("anuncioId");

-- CreateIndex
CREATE UNIQUE INDEX "AnuncioLectura_anuncioId_userId_key" ON "AnuncioLectura"("anuncioId", "userId");

-- CreateIndex
CREATE INDEX "JornadaLaboral_userId_inicio_idx" ON "JornadaLaboral"("userId", "inicio");

-- CreateIndex
CREATE INDEX "JornadaLaboral_inicio_idx" ON "JornadaLaboral"("inicio");

-- CreateIndex
CREATE INDEX "JornadaLaboral_fin_idx" ON "JornadaLaboral"("fin");

-- AddForeignKey
ALTER TABLE "Anuncio" ADD CONSTRAINT "Anuncio_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnuncioLectura" ADD CONSTRAINT "AnuncioLectura_anuncioId_fkey" FOREIGN KEY ("anuncioId") REFERENCES "Anuncio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnuncioLectura" ADD CONSTRAINT "AnuncioLectura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JornadaLaboral" ADD CONSTRAINT "JornadaLaboral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
