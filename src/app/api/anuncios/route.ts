import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { getDestinatariosAnuncio, buildAnuncioVisibleWhere } from "@/lib/anuncios";
import { esCategoriaValida, sanitizeRolesDestino, audienciaLabel } from "@/lib/anunciosConfig";

const PRIORIDADES = ["BAJA", "MEDIA", "ALTA", "URGENTE"] as const;
type Prioridad = (typeof PRIORIDADES)[number];

/**
 * GET /api/anuncios
 * Lista los anuncios del tablero.
 * - Usuarios: solo activos, no expirados y dirigidos a su rol (o a todos), con flag `leido`.
 * - Admin/Mod: todos (incluye inactivos) + conteo de lecturas para gestión.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const gestor = isModOrAdmin(session.rol);

  const where = gestor ? {} : buildAnuncioVisibleWhere(session.rol);

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
    fijado: a.fijado,
    activo: a.activo,
    notificar: a.notificar,
    intervaloHoras: a.intervaloHoras,
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
 * Si notificar=true, envía push inmediato a la audiencia (roles destino,
 * o todos los usuarios activos si no se especifican roles).
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
  const fijado = body.fijado === true;
  const notificar = body.notificar !== false;
  const intervaloHoras = Math.max(1, Math.min(168, Number(body.intervaloHoras) || 1));
  const fechaExpiracion = body.fechaExpiracion ? new Date(body.fechaExpiracion) : null;

  const anuncio = await prisma.anuncio.create({
    data: {
      titulo,
      contenido,
      prioridad,
      categoria,
      rolesDestino,
      fijado,
      notificar,
      intervaloHoras,
      fechaExpiracion: fechaExpiracion && !isNaN(fechaExpiracion.getTime()) ? fechaExpiracion : null,
      ultimaNotificacion: notificar ? new Date() : null,
      autorId: session.userId,
    },
    include: { autor: { select: { id: true, nombre: true } } },
  });

  // Envío inmediato de push a la audiencia (sin incluir al autor)
  if (notificar) {
    const destinatarios = await getDestinatariosAnuncio(rolesDestino, session.userId);
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
      descripcion: `Anuncio "${titulo}" publicado (${categoria}, para: ${audienciaLabel(rolesDestino)})`,
      entidad: "ANUNCIO",
      entidadId: anuncio.id,
      userId: session.userId,
    },
  }).catch(() => {});

  return NextResponse.json(anuncio, { status: 201 });
}
