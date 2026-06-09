-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MODERADOR', 'TECNICO');

-- CreateEnum
CREATE TYPE "Prioridad" AS ENUM ('BAJA', 'MEDIA', 'ALTA', 'URGENTE');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "passwordPlain" TEXT,
    "rol" "Role" NOT NULL DEFAULT 'TECNICO',
    "esMesa" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "telefono" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Delegacion" (
    "id" TEXT NOT NULL,
    "delegadorId" TEXT NOT NULL,
    "delegadoId" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "notas" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Delegacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EstadoConfig" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "entidad" TEXT NOT NULL DEFAULT 'PREDIO',
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "EstadoConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EspacioTrabajo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "icono" TEXT NOT NULL DEFAULT 'folder',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "camposConfig" JSONB,
    "estadosConfig" JSONB,
    "parentId" TEXT,
    "creadorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EspacioTrabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Predio" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "direccion" TEXT,
    "ciudad" TEXT,
    "tipo" TEXT,
    "latitud" DOUBLE PRECISION,
    "longitud" DOUBLE PRECISION,
    "notas" TEXT,
    "notasTecnico" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "fechaProgramada" TIMESTAMP(3),
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "seccion" TEXT,
    "incidencias" TEXT,
    "lacR" TEXT,
    "cue" TEXT,
    "fechaDesde" TIMESTAMP(3),
    "fechaHasta" TIMESTAMP(3),
    "ambito" TEXT,
    "provincia" TEXT,
    "cuePredio" TEXT,
    "gpsPredio" TEXT,
    "tipoRed" TEXT,
    "codigoPostal" TEXT,
    "caracteristicaTelefonica" TEXT,
    "telefono" TEXT,
    "lab" TEXT,
    "nombreInstitucion" TEXT,
    "correo" TEXT,
    "fechaActualizacion" TIMESTAMP(3),
    "camposExtra" JSONB,
    "enFacturacion" BOOLEAN NOT NULL DEFAULT false,
    "merakiNetworkId" TEXT,
    "merakiOrgId" TEXT,
    "merakiNetworkName" TEXT,
    "espacioId" TEXT,
    "estadoId" TEXT,
    "creadorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Predio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Equipo" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "numeroSerie" TEXT,
    "modelo" TEXT,
    "marca" TEXT,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "estado" TEXT NOT NULL DEFAULT 'DISPONIBLE',
    "categoria" TEXT,
    "ubicacion" TEXT,
    "notas" TEXT,
    "fecha" TEXT,
    "etiqueta" TEXT,
    "etiquetaColor" TEXT,
    "proveedor" TEXT,
    "camposExtra" JSONB,
    "predioId" TEXT,
    "asignadoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Equipo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Etiqueta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',

    CONSTRAINT "Etiqueta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PredioEtiqueta" (
    "predioId" TEXT NOT NULL,
    "etiquetaId" TEXT NOT NULL,

    CONSTRAINT "PredioEtiqueta_pkey" PRIMARY KEY ("predioId","etiquetaId")
);

-- CreateTable
CREATE TABLE "Comentario" (
    "id" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "predioId" TEXT,
    "equipoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Comentario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Asignacion" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "notas" TEXT,
    "userId" TEXT NOT NULL,
    "predioId" TEXT,
    "equipoId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Asignacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notificacion" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "enlace" TEXT,
    "entidad" TEXT,
    "entidadId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Actividad" (
    "id" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "descripcion" TEXT,
    "entidad" TEXT NOT NULL,
    "entidadId" TEXT NOT NULL,
    "metadata" JSONB,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Actividad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TareaCalendario" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "fecha" TIMESTAMP(3) NOT NULL,
    "fechaFin" TIMESTAMP(3),
    "horaInicio" TEXT,
    "horaFin" TEXT,
    "tipo" TEXT NOT NULL DEFAULT 'TAREA',
    "categoria" TEXT NOT NULL DEFAULT 'GENERAL',
    "prioridad" "Prioridad" NOT NULL DEFAULT 'MEDIA',
    "completada" BOOLEAN NOT NULL DEFAULT false,
    "color" TEXT NOT NULL DEFAULT '#3b82f6',
    "todoElDia" BOOLEAN NOT NULL DEFAULT false,
    "ubicacion" TEXT,
    "notificarPush" BOOLEAN NOT NULL DEFAULT true,
    "esAsignada" BOOLEAN NOT NULL DEFAULT false,
    "notas" TEXT,
    "creadorId" TEXT NOT NULL,
    "asignadoId" TEXT,
    "predioId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TareaCalendario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Instructivo" (
    "id" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "contenido" TEXT,
    "videoUrl" TEXT,
    "videoNombre" TEXT,
    "videoRuta" TEXT,
    "videoTipo" TEXT,
    "videoSize" INTEGER,
    "imagenNombre" TEXT,
    "imagenRuta" TEXT,
    "imagenTipo" TEXT,
    "imagenSize" INTEGER,
    "pdfNombre" TEXT,
    "pdfRuta" TEXT,
    "pdfTipo" TEXT,
    "pdfSize" INTEGER,
    "categoria" TEXT NOT NULL DEFAULT 'General',
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Instructivo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Acta" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "archivoNombre" TEXT NOT NULL,
    "archivoTipo" TEXT NOT NULL,
    "archivoRuta" TEXT NOT NULL,
    "archivoSize" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "predioId" TEXT,
    "subidoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Acta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MonitoreoPostCambio" (
    "id" TEXT NOT NULL,
    "predioId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "estadoAnterior" TEXT,
    "estadoNuevo" TEXT,
    "networkId" TEXT,
    "orgId" TEXT,
    "checksRealizados" INTEGER NOT NULL DEFAULT 0,
    "maxChecks" INTEGER NOT NULL DEFAULT 2,
    "intervaloMin" INTEGER NOT NULL DEFAULT 15,
    "proximoCheck" TIMESTAMP(3) NOT NULL,
    "completado" BOOLEAN NOT NULL DEFAULT false,
    "resultados" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonitoreoPostCambio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReporteFacturacion" (
    "id" TEXT NOT NULL,
    "semana" TEXT NOT NULL,
    "fechaDesde" TIMESTAMP(3) NOT NULL,
    "fechaHasta" TIMESTAMP(3) NOT NULL,
    "totalTareas" INTEGER NOT NULL,
    "resumen" JSONB NOT NULL,
    "csvRuta" TEXT,
    "csvNombre" TEXT,
    "generadoEn" TEXT NOT NULL DEFAULT 'AUTO',
    "generadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReporteFacturacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermisoSeccion" (
    "id" TEXT NOT NULL,
    "seccion" TEXT NOT NULL,
    "rol" "Role" NOT NULL,
    "ver" BOOLEAN NOT NULL DEFAULT true,
    "crear" BOOLEAN NOT NULL DEFAULT false,
    "editar" BOOLEAN NOT NULL DEFAULT false,
    "eliminar" BOOLEAN NOT NULL DEFAULT false,
    "exportar" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PermisoSeccion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PermisoEstado" (
    "id" TEXT NOT NULL,
    "estadoId" TEXT NOT NULL,
    "rol" "Role" NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PermisoEstado_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "PermisoEstadoUsuario" (
    "id" TEXT NOT NULL,
    "estadoId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "PermisoEstadoUsuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampoPersonalizado" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL DEFAULT 'text',
    "opciones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "ancho" INTEGER NOT NULL DEFAULT 100,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampoPersonalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConfiguracionVista" (
    "id" TEXT NOT NULL,
    "clave" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "ConfiguracionVista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hospedaje" (
    "id" TEXT NOT NULL,
    "ubicacion" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT,
    "garage" TEXT,
    "telefono" TEXT,
    "provincia" TEXT,
    "notas" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hospedaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PapeleraItem" (
    "id" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "datos" JSONB NOT NULL,
    "eliminadoPorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PapeleraItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatConversacion" (
    "id" TEXT NOT NULL,
    "asunto" TEXT,
    "estado" TEXT NOT NULL DEFAULT 'ABIERTA',
    "creadorId" TEXT NOT NULL,
    "agenteId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "cerradoAt" TIMESTAMP(3),
    "leidoPorCreadorAt" TIMESTAMP(3),
    "leidoPorMesaAt" TIMESTAMP(3),

    CONSTRAINT "ChatConversacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMensaje" (
    "id" TEXT NOT NULL,
    "contenido" TEXT NOT NULL,
    "conversacionId" TEXT NOT NULL,
    "autorId" TEXT NOT NULL,
    "replyToId" TEXT,
    "archivoUrl" TEXT,
    "archivoNombre" TEXT,
    "archivoTipo" TEXT,
    "archivoTamanio" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "editadoAt" TIMESTAMP(3),

    CONSTRAINT "ChatMensaje_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChatMensajeReaction" (
    "id" TEXT NOT NULL,
    "mensajeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatMensajeReaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoEspacio" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "espacioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoEspacio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccesoEspacioRol" (
    "id" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "espacioId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccesoEspacioRol_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "RegistroAcceso" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accion" TEXT NOT NULL,
    "detalle" TEXT,
    "metadata" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RegistroAcceso_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Delegacion_delegadoId_idx" ON "Delegacion"("delegadoId");

-- CreateIndex
CREATE INDEX "Delegacion_delegadorId_idx" ON "Delegacion"("delegadorId");

-- CreateIndex
CREATE UNIQUE INDEX "Delegacion_delegadorId_delegadoId_key" ON "Delegacion"("delegadorId", "delegadoId");

-- CreateIndex
CREATE UNIQUE INDEX "EstadoConfig_clave_key" ON "EstadoConfig"("clave");

-- CreateIndex
CREATE INDEX "EspacioTrabajo_parentId_idx" ON "EspacioTrabajo"("parentId");

-- CreateIndex
CREATE INDEX "EspacioTrabajo_orden_idx" ON "EspacioTrabajo"("orden");

-- CreateIndex
CREATE UNIQUE INDEX "Predio_codigo_key" ON "Predio"("codigo");

-- CreateIndex
CREATE INDEX "Predio_merakiNetworkId_idx" ON "Predio"("merakiNetworkId");

-- CreateIndex
CREATE INDEX "Predio_estadoId_idx" ON "Predio"("estadoId");

-- CreateIndex
CREATE INDEX "Predio_codigo_idx" ON "Predio"("codigo");

-- CreateIndex
CREATE INDEX "Predio_provincia_idx" ON "Predio"("provincia");

-- CreateIndex
CREATE INDEX "Predio_espacioId_idx" ON "Predio"("espacioId");

-- CreateIndex
CREATE INDEX "Predio_updatedAt_idx" ON "Predio"("updatedAt");

-- CreateIndex
CREATE INDEX "Predio_prioridad_updatedAt_idx" ON "Predio"("prioridad", "updatedAt");

-- CreateIndex
CREATE INDEX "Predio_provincia_updatedAt_idx" ON "Predio"("provincia", "updatedAt");

-- CreateIndex
CREATE INDEX "Predio_espacioId_updatedAt_idx" ON "Predio"("espacioId", "updatedAt");

-- CreateIndex
CREATE INDEX "Predio_fechaHasta_idx" ON "Predio"("fechaHasta");

-- CreateIndex
CREATE INDEX "Predio_fechaProgramada_idx" ON "Predio"("fechaProgramada");

-- CreateIndex
CREATE INDEX "Predio_estadoId_fechaActualizacion_idx" ON "Predio"("estadoId", "fechaActualizacion");

-- CreateIndex
CREATE INDEX "Predio_estadoId_updatedAt_idx" ON "Predio"("estadoId", "updatedAt");

-- CreateIndex
CREATE INDEX "Predio_creadorId_idx" ON "Predio"("creadorId");

-- CreateIndex
CREATE INDEX "Predio_enFacturacion_idx" ON "Predio"("enFacturacion");

-- CreateIndex
CREATE UNIQUE INDEX "Equipo_numeroSerie_key" ON "Equipo"("numeroSerie");

-- CreateIndex
CREATE INDEX "Equipo_estado_idx" ON "Equipo"("estado");

-- CreateIndex
CREATE INDEX "Equipo_categoria_idx" ON "Equipo"("categoria");

-- CreateIndex
CREATE INDEX "Equipo_updatedAt_idx" ON "Equipo"("updatedAt");

-- CreateIndex
CREATE INDEX "Equipo_estado_updatedAt_idx" ON "Equipo"("estado", "updatedAt");

-- CreateIndex
CREATE INDEX "Equipo_categoria_updatedAt_idx" ON "Equipo"("categoria", "updatedAt");

-- CreateIndex
CREATE INDEX "Equipo_predioId_idx" ON "Equipo"("predioId");

-- CreateIndex
CREATE INDEX "Equipo_asignadoId_idx" ON "Equipo"("asignadoId");

-- CreateIndex
CREATE UNIQUE INDEX "Etiqueta_nombre_key" ON "Etiqueta"("nombre");

-- CreateIndex
CREATE INDEX "Comentario_predioId_idx" ON "Comentario"("predioId");

-- CreateIndex
CREATE INDEX "Comentario_equipoId_idx" ON "Comentario"("equipoId");

-- CreateIndex
CREATE INDEX "Comentario_userId_idx" ON "Comentario"("userId");

-- CreateIndex
CREATE INDEX "Comentario_predioId_createdAt_idx" ON "Comentario"("predioId", "createdAt");

-- CreateIndex
CREATE INDEX "Asignacion_userId_idx" ON "Asignacion"("userId");

-- CreateIndex
CREATE INDEX "Asignacion_predioId_idx" ON "Asignacion"("predioId");

-- CreateIndex
CREATE INDEX "Asignacion_userId_predioId_idx" ON "Asignacion"("userId", "predioId");

-- CreateIndex
CREATE INDEX "Notificacion_userId_leida_idx" ON "Notificacion"("userId", "leida");

-- CreateIndex
CREATE INDEX "Notificacion_userId_createdAt_idx" ON "Notificacion"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Notificacion_createdAt_idx" ON "Notificacion"("createdAt");

-- CreateIndex
CREATE INDEX "Actividad_userId_idx" ON "Actividad"("userId");

-- CreateIndex
CREATE INDEX "Actividad_entidad_idx" ON "Actividad"("entidad");

-- CreateIndex
CREATE INDEX "Actividad_createdAt_idx" ON "Actividad"("createdAt");

-- CreateIndex
CREATE INDEX "Actividad_entidad_createdAt_idx" ON "Actividad"("entidad", "createdAt");

-- CreateIndex
CREATE INDEX "Actividad_userId_createdAt_idx" ON "Actividad"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Actividad_entidadId_idx" ON "Actividad"("entidadId");

-- CreateIndex
CREATE INDEX "TareaCalendario_fecha_idx" ON "TareaCalendario"("fecha");

-- CreateIndex
CREATE INDEX "TareaCalendario_asignadoId_idx" ON "TareaCalendario"("asignadoId");

-- CreateIndex
CREATE INDEX "TareaCalendario_creadorId_idx" ON "TareaCalendario"("creadorId");

-- CreateIndex
CREATE INDEX "TareaCalendario_asignadoId_fecha_idx" ON "TareaCalendario"("asignadoId", "fecha");

-- CreateIndex
CREATE INDEX "TareaCalendario_creadorId_fecha_idx" ON "TareaCalendario"("creadorId", "fecha");

-- CreateIndex
CREATE INDEX "TareaCalendario_completada_fecha_idx" ON "TareaCalendario"("completada", "fecha");

-- CreateIndex
CREATE INDEX "TareaCalendario_categoria_idx" ON "TareaCalendario"("categoria");

-- CreateIndex
CREATE INDEX "Instructivo_categoria_idx" ON "Instructivo"("categoria");

-- CreateIndex
CREATE INDEX "Acta_predioId_idx" ON "Acta"("predioId");

-- CreateIndex
CREATE INDEX "MonitoreoPostCambio_completado_proximoCheck_idx" ON "MonitoreoPostCambio"("completado", "proximoCheck");

-- CreateIndex
CREATE INDEX "MonitoreoPostCambio_userId_idx" ON "MonitoreoPostCambio"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

-- CreateIndex
CREATE INDEX "ReporteFacturacion_createdAt_idx" ON "ReporteFacturacion"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ReporteFacturacion_semana_key" ON "ReporteFacturacion"("semana");

-- CreateIndex
CREATE INDEX "PermisoSeccion_seccion_idx" ON "PermisoSeccion"("seccion");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoSeccion_seccion_rol_key" ON "PermisoSeccion"("seccion", "rol");

-- CreateIndex
CREATE INDEX "PermisoEstado_estadoId_idx" ON "PermisoEstado"("estadoId");

-- CreateIndex
CREATE INDEX "PermisoEstado_rol_idx" ON "PermisoEstado"("rol");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoEstado_estadoId_rol_key" ON "PermisoEstado"("estadoId", "rol");

-- CreateIndex
CREATE INDEX "PermisoSeccionUsuario_userId_idx" ON "PermisoSeccionUsuario"("userId");

-- CreateIndex
CREATE INDEX "PermisoSeccionUsuario_seccion_idx" ON "PermisoSeccionUsuario"("seccion");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoSeccionUsuario_seccion_userId_key" ON "PermisoSeccionUsuario"("seccion", "userId");

-- CreateIndex
CREATE INDEX "PermisoEstadoUsuario_userId_idx" ON "PermisoEstadoUsuario"("userId");

-- CreateIndex
CREATE INDEX "PermisoEstadoUsuario_estadoId_idx" ON "PermisoEstadoUsuario"("estadoId");

-- CreateIndex
CREATE UNIQUE INDEX "PermisoEstadoUsuario_estadoId_userId_key" ON "PermisoEstadoUsuario"("estadoId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "CampoPersonalizado_clave_key" ON "CampoPersonalizado"("clave");

-- CreateIndex
CREATE INDEX "CampoPersonalizado_activo_orden_idx" ON "CampoPersonalizado"("activo", "orden");

-- CreateIndex
CREATE UNIQUE INDEX "ConfiguracionVista_clave_key" ON "ConfiguracionVista"("clave");

-- CreateIndex
CREATE INDEX "Hospedaje_provincia_idx" ON "Hospedaje"("provincia");

-- CreateIndex
CREATE INDEX "Hospedaje_ubicacion_idx" ON "Hospedaje"("ubicacion");

-- CreateIndex
CREATE INDEX "Hospedaje_activo_idx" ON "Hospedaje"("activo");

-- CreateIndex
CREATE INDEX "PapeleraItem_tipo_idx" ON "PapeleraItem"("tipo");

-- CreateIndex
CREATE INDEX "PapeleraItem_eliminadoPorId_idx" ON "PapeleraItem"("eliminadoPorId");

-- CreateIndex
CREATE INDEX "PapeleraItem_createdAt_idx" ON "PapeleraItem"("createdAt");

-- CreateIndex
CREATE INDEX "ChatConversacion_creadorId_idx" ON "ChatConversacion"("creadorId");

-- CreateIndex
CREATE INDEX "ChatConversacion_agenteId_idx" ON "ChatConversacion"("agenteId");

-- CreateIndex
CREATE INDEX "ChatConversacion_estado_idx" ON "ChatConversacion"("estado");

-- CreateIndex
CREATE INDEX "ChatConversacion_createdAt_idx" ON "ChatConversacion"("createdAt");

-- CreateIndex
CREATE INDEX "ChatMensaje_conversacionId_createdAt_idx" ON "ChatMensaje"("conversacionId", "createdAt");

-- CreateIndex
CREATE INDEX "ChatMensaje_autorId_idx" ON "ChatMensaje"("autorId");

-- CreateIndex
CREATE INDEX "ChatMensaje_replyToId_idx" ON "ChatMensaje"("replyToId");

-- CreateIndex
CREATE INDEX "ChatMensajeReaction_mensajeId_idx" ON "ChatMensajeReaction"("mensajeId");

-- CreateIndex
CREATE INDEX "ChatMensajeReaction_userId_idx" ON "ChatMensajeReaction"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "ChatMensajeReaction_mensajeId_userId_key" ON "ChatMensajeReaction"("mensajeId", "userId");

-- CreateIndex
CREATE INDEX "AccesoEspacio_userId_idx" ON "AccesoEspacio"("userId");

-- CreateIndex
CREATE INDEX "AccesoEspacio_espacioId_idx" ON "AccesoEspacio"("espacioId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoEspacio_userId_espacioId_key" ON "AccesoEspacio"("userId", "espacioId");

-- CreateIndex
CREATE INDEX "AccesoEspacioRol_rol_idx" ON "AccesoEspacioRol"("rol");

-- CreateIndex
CREATE INDEX "AccesoEspacioRol_espacioId_idx" ON "AccesoEspacioRol"("espacioId");

-- CreateIndex
CREATE UNIQUE INDEX "AccesoEspacioRol_rol_espacioId_key" ON "AccesoEspacioRol"("rol", "espacioId");

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

-- CreateIndex
CREATE INDEX "RegistroAcceso_userId_createdAt_idx" ON "RegistroAcceso"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAcceso_accion_createdAt_idx" ON "RegistroAcceso"("accion", "createdAt");

-- CreateIndex
CREATE INDEX "RegistroAcceso_createdAt_idx" ON "RegistroAcceso"("createdAt");

-- AddForeignKey
ALTER TABLE "Delegacion" ADD CONSTRAINT "Delegacion_delegadorId_fkey" FOREIGN KEY ("delegadorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Delegacion" ADD CONSTRAINT "Delegacion_delegadoId_fkey" FOREIGN KEY ("delegadoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspacioTrabajo" ADD CONSTRAINT "EspacioTrabajo_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "EspacioTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EspacioTrabajo" ADD CONSTRAINT "EspacioTrabajo_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Predio" ADD CONSTRAINT "Predio_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioTrabajo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Predio" ADD CONSTRAINT "Predio_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "EstadoConfig"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Predio" ADD CONSTRAINT "Predio_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Equipo" ADD CONSTRAINT "Equipo_asignadoId_fkey" FOREIGN KEY ("asignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredioEtiqueta" ADD CONSTRAINT "PredioEtiqueta_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PredioEtiqueta" ADD CONSTRAINT "PredioEtiqueta_etiquetaId_fkey" FOREIGN KEY ("etiquetaId") REFERENCES "Etiqueta"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Comentario" ADD CONSTRAINT "Comentario_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Asignacion" ADD CONSTRAINT "Asignacion_equipoId_fkey" FOREIGN KEY ("equipoId") REFERENCES "Equipo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notificacion" ADD CONSTRAINT "Notificacion_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Actividad" ADD CONSTRAINT "Actividad_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCalendario" ADD CONSTRAINT "TareaCalendario_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCalendario" ADD CONSTRAINT "TareaCalendario_asignadoId_fkey" FOREIGN KEY ("asignadoId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TareaCalendario" ADD CONSTRAINT "TareaCalendario_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Instructivo" ADD CONSTRAINT "Instructivo_creadoPorId_fkey" FOREIGN KEY ("creadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acta" ADD CONSTRAINT "Acta_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Acta" ADD CONSTRAINT "Acta_subidoPorId_fkey" FOREIGN KEY ("subidoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoreoPostCambio" ADD CONSTRAINT "MonitoreoPostCambio_predioId_fkey" FOREIGN KEY ("predioId") REFERENCES "Predio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MonitoreoPostCambio" ADD CONSTRAINT "MonitoreoPostCambio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PushSubscription" ADD CONSTRAINT "PushSubscription_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReporteFacturacion" ADD CONSTRAINT "ReporteFacturacion_generadoPorId_fkey" FOREIGN KEY ("generadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoEstado" ADD CONSTRAINT "PermisoEstado_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "EstadoConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoSeccionUsuario" ADD CONSTRAINT "PermisoSeccionUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoEstadoUsuario" ADD CONSTRAINT "PermisoEstadoUsuario_estadoId_fkey" FOREIGN KEY ("estadoId") REFERENCES "EstadoConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PermisoEstadoUsuario" ADD CONSTRAINT "PermisoEstadoUsuario_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PapeleraItem" ADD CONSTRAINT "PapeleraItem_eliminadoPorId_fkey" FOREIGN KEY ("eliminadoPorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversacion" ADD CONSTRAINT "ChatConversacion_creadorId_fkey" FOREIGN KEY ("creadorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatConversacion" ADD CONSTRAINT "ChatConversacion_agenteId_fkey" FOREIGN KEY ("agenteId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMensaje" ADD CONSTRAINT "ChatMensaje_conversacionId_fkey" FOREIGN KEY ("conversacionId") REFERENCES "ChatConversacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMensaje" ADD CONSTRAINT "ChatMensaje_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMensaje" ADD CONSTRAINT "ChatMensaje_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChatMensaje"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMensajeReaction" ADD CONSTRAINT "ChatMensajeReaction_mensajeId_fkey" FOREIGN KEY ("mensajeId") REFERENCES "ChatMensaje"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatMensajeReaction" ADD CONSTRAINT "ChatMensajeReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEspacio" ADD CONSTRAINT "AccesoEspacio_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEspacio" ADD CONSTRAINT "AccesoEspacio_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccesoEspacioRol" ADD CONSTRAINT "AccesoEspacioRol_espacioId_fkey" FOREIGN KEY ("espacioId") REFERENCES "EspacioTrabajo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Anuncio" ADD CONSTRAINT "Anuncio_autorId_fkey" FOREIGN KEY ("autorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnuncioLectura" ADD CONSTRAINT "AnuncioLectura_anuncioId_fkey" FOREIGN KEY ("anuncioId") REFERENCES "Anuncio"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnuncioLectura" ADD CONSTRAINT "AnuncioLectura_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JornadaLaboral" ADD CONSTRAINT "JornadaLaboral_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RegistroAcceso" ADD CONSTRAINT "RegistroAcceso_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

