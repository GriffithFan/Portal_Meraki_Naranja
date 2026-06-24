import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { getDestinatariosAnuncio, buildAnuncioVisibleWhere } from "@/lib/anuncios";
import { esCategoriaValida, sanitizeRolesDestino, audienciaLabel } from "@/lib/anunciosConfig";

const PRIORIDADES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;
type Prioridad = (typeof PRIORIDADES)[number];

function sanitizeUsuariosDestino(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((v): v is string => typeof v === "string" && v.length > 0)));
}

/**
 * GET /api/anuncios
 * Lista los anuncios del tablero.
 * - Usuarios: solo activos, ya publicados, no expirados y dirigidos a ellos, con flag `leido`.
 * - Admin/Mod: todos (incluye inactivos) + conteo de lecturas para gestión.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const gestor = isModOrAdmin(session.rol);

  const where = gestor ? {} : buildAnuncioVisibleWhere(session.rol, session.userId);

  const anuncios = await prisma.anuncio.findMany({
    where,
    orderBy: [{ fijado: "desc" }, { createdAt: "desc" }],
    include: {
      autor: { select: { id: true, nombre: true } },
      lecturas: { where: { userId: session.userId }, select: { id: true } },
      _count: gestor ? { select: { lecturas: true } } : undefined,
    },
  });

  const items = anuncios.map((a) => ({
    id: a.id,
    titulo: a.titulo,
    contenido: a.contenido,
    prioridad: a.prioridad,
    categoria: a.categoria,
    rolesDestino: a.rolesDestino,
    usuariosDestino: a.usuariosDestino,
    requiereAceptacion: a.requiereAceptacion,
    fijado: a.fijado,
    activo: a.activo,
    notificar: a.notificar,
    intervaloHoras: a.intervaloHoras,
    fechaPublicacion: a.fechaPublicacion,
    fechaExpiracion: a.fechaExpiracion,
    autor: a.autor,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
    leido: a.lecturas.length > 0,
    lecturasCount: gestor ? (a as unknown as { _count?: { lecturas: number } })._count?.lecturas ?? 0 : undefined,
  }));

  return NextResponse.json({ anuncios: items });
}

/**
 * POST /api/anuncios — crea un anuncio (solo Admin/Mod).
 * Soporta audiencia manual por usuario, programación (fechaPublicacion) e
 * importancia "Muy alta" (URGENTE) = popup bloqueante con aceptación.
 */
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const body = await request.json();
  const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
  const contenido = typeof body.contenido === "string" ? body.contenido.trim() : "";

  if (!titulo || !contenido)
    return NextResponse.json({ error: "Título y contenido son obligatorios" }, { status: 400 });

  const prioridad: Prioridad = PRIORIDADES.includes(body.prioridad) ? body.prioridad : "MEDIA";
  const categoria = esCategoriaValida(body.categoria) ? body.categoria : "GENERAL";
  const rolesDestino = sanitizeRolesDestino(body.rolesDestino);
  const usuariosDestino = sanitizeUsuariosDestino(body.usuariosDestino);
  const requiereAceptacion = prioridad === "URGENTE"; // "Muy alta" → bloqueante
  const fijado = body.fijado === true;
  const notificar = body.notificar !== false;
  const intervaloHoras = Math.max(1, Math.min(168, Number(body.intervaloHoras) || 1));
  const fechaExpiracion = body.fechaExpiracion ? new Date(body.fechaExpiracion) : null;
  const fechaPublicacionRaw = body.fechaPublicacion ? new Date(body.fechaPublicacion) : null;
  const fechaPublicacion = fechaPublicacionRaw && !isNaN(fechaPublicacionRaw.getTime()) ? fechaPublicacionRaw : null;
  const ahora = new Date();
  const yaPublicado = !fechaPublicacion || fechaPublicacion <= ahora;

  const anuncio = await prisma.anuncio.create({
    data: {
      titulo,
      contenido,
      prioridad,
      categoria,
      rolesDestino,
      usuariosDestino,
      requiereAceptacion,
      fijado,
      notificar,
      intervaloHoras,
      fechaPublicacion,
      fechaExpiracion: fechaExpiracion && !isNaN(fechaExpiracion.getTime()) ? fechaExpiracion : null,
      // Si está programado a futuro, el cron enviará el push al publicarse.
      ultimaNotificacion: notificar && yaPublicado ? ahora : null,
      autorId: session.userId,
    },
    include: { autor: { select: { id: true, nombre: true } } },
  });

  // Envío inmediato solo si ya está publicado (programados → los toma el cron).
  if (notificar && yaPublicado) {
    const destinatarios = await getDestinatariosAnuncio(rolesDestino, usuariosDestino, session.userId);
    const prioridadLabel = prioridad === "URGENTE" ? "🔴 URGENTE — " : prioridad === "ALTA" ? "🟠 " : "";
    await Promise.allSettled(
      destinatarios.map((uid) =>
        enviarPushYBandeja(uid, {
          tipo: "ANUNCIO",
          titulo: `${prioridadLabel}${titulo}`,
          mensaje: contenido.length > 180 ? contenido.slice(0, 177) + "…" : contenido,
          enlace: "/dashboard/anuncios",
          entidad: "ANUNCIO",
          entidadId: anuncio.id,
          tag: `anuncio-${anuncio.id}`,
        })
      )
    );
  }

  await prisma.actividad.create({
    data: {
      accion: "CREAR",
      descripcion: `Anuncio "${titulo}" ${yaPublicado ? "publicado" : "programado"} (${categoria}, para: ${usuariosDestino.length > 0 ? `${usuariosDestino.length} usuario(s)` : audienciaLabel(rolesDestino)})`,
      entidad: "ANUNCIO",
      entidadId: anuncio.id,
      userId: session.userId,
    },
  }).catch(() => {});

  return NextResponse.json(anuncio, { status: 201 });
}
