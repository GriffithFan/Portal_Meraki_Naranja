import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(parseInt(searchParams.get("page") || "1", 10) || 1, 1);
  const pageSize = Math.min(Math.max(parseInt(searchParams.get("pageSize") || "50", 10) || 50, 10), 200);
  const origen = searchParams.get("origen"); // SERVER | CLIENTE
  const nivel = searchParams.get("nivel");   // ERROR | WARN
  const search = (searchParams.get("search") || "").trim().slice(0, 140);
  const days = parseInt(searchParams.get("days") || "0", 10) || 0;

  const where: any = {};
  if (origen) where.origen = origen;
  if (nivel) where.nivel = nivel;
  if (days > 0) { const d = new Date(); d.setDate(d.getDate() - days); where.createdAt = { gte: d }; }
  if (search) where.OR = [{ mensaje: { contains: search, mode: "insensitive" } }, { ruta: { contains: search, mode: "insensitive" } }];

  const [items, total, ultimas24h, totalCliente, totalServer] = await Promise.all([
    prisma.errorLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    prisma.errorLog.count({ where }),
    prisma.errorLog.count({ where: { createdAt: { gte: new Date(Date.now() - 24 * 3600 * 1000) } } }),
    prisma.errorLog.count({ where: { origen: "CLIENTE" } }),
    prisma.errorLog.count({ where: { origen: "SERVER" } }),
  ]);

  return NextResponse.json({ items, total, page, pageSize, resumen: { ultimas24h, totalCliente, totalServer } });
}

// DELETE → purga errores. ?olderThanDays=N (0 o ausente = todos). Solo ADMIN.
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  const olderThanDays = parseInt(new URL(request.url).searchParams.get("olderThanDays") || "0", 10) || 0;
  const where: any = {};
  if (olderThanDays > 0) { const d = new Date(); d.setDate(d.getDate() - olderThanDays); where.createdAt = { lt: d }; }
  const res = await prisma.errorLog.deleteMany({ where });
  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR", entidad: "ErrorLog", entidadId: "(varios)",
      descripcion: `Purga de ${res.count} error(es) de la página${olderThanDays > 0 ? ` (más de ${olderThanDays} días)` : " (todos)"} por ${session.nombre}`,
      userId: session.userId, metadata: { count: res.count, olderThanDays },
    },
  }).catch(() => {});
  return NextResponse.json({ ok: true, eliminados: res.count });
}
