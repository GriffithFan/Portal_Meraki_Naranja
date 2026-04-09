import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { permisosSchema, parseBody, isErrorResponse } from "@/lib/validation";

// GET: obtener permisos de todas las secciones (cualquier autenticado puede consultar)
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const permisos = await prisma.permisoSeccion.findMany({
    orderBy: [{ seccion: "asc" }, { rol: "asc" }],
  });

  // Permisos por usuario individual (secciones)
  const permisosSeccionUsuario = await prisma.permisoSeccionUsuario.findMany({
    include: { user: { select: { id: true, nombre: true } } },
    orderBy: [{ userId: "asc" }, { seccion: "asc" }],
  });

  return NextResponse.json({ permisos, permisosSeccionUsuario });
}

// Secciones configurables (excluye monitoreo que es visible para todos)
const SECCIONES_VALIDAS = [
  "tareas", "calendario", "stock", "importar", "predios", "hospedajes",
  "bandeja", "actividad", "chat", "instructivo", "actas",
  "facturacion", "usuarios", "kpis", "mapa",
  "permisos", "auditoria", "papelera",
];

// PUT: actualizar permisos (solo ADMIN)
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  /* eslint-disable @typescript-eslint/no-explicit-any */
  let body: any;
  try {
    body = await request.json();
  } catch {
    // Fallback a schema de validación
    const data = await parseBody(request, permisosSchema);
    if (isErrorResponse(data)) return data;
    body = data;
  }

  const { permisos, permisosSeccionUsuario } = body;

  // ── Permisos por rol (existente) ──
  if (Array.isArray(permisos)) {
    const results = [];
    for (const p of permisos) {
      if (!SECCIONES_VALIDAS.includes(p.seccion)) continue;
      if (!["ADMIN", "MODERADOR", "TECNICO"].includes(p.rol)) continue;
      if (p.rol === "ADMIN") continue;

      const result = await prisma.permisoSeccion.upsert({
        where: { seccion_rol: { seccion: p.seccion, rol: p.rol as "ADMIN" | "MODERADOR" | "TECNICO" } },
        update: { ver: p.ver, crear: p.crear ?? false, editar: p.editar, eliminar: p.eliminar ?? false, exportar: p.exportar ?? false },
        create: {
          seccion: p.seccion,
          rol: p.rol as "ADMIN" | "MODERADOR" | "TECNICO",
          ver: p.ver,
          crear: p.crear ?? false,
          editar: p.editar,
          eliminar: p.eliminar ?? false,
          exportar: p.exportar ?? false,
        },
      });
      results.push(result);
    }
  }

  // ── Permisos por usuario individual (secciones) ──
  if (Array.isArray(permisosSeccionUsuario)) {
    for (const p of permisosSeccionUsuario) {
      if (!p.seccion || !p.userId) continue;
      if (!SECCIONES_VALIDAS.includes(p.seccion)) continue;

      await prisma.permisoSeccionUsuario.upsert({
        where: { seccion_userId: { seccion: p.seccion, userId: p.userId } },
        update: {
          ver: p.ver ?? true,
          crear: p.crear ?? false,
          editar: p.editar ?? false,
          eliminar: p.eliminar ?? false,
          exportar: p.exportar ?? false,
        },
        create: {
          seccion: p.seccion,
          userId: p.userId,
          ver: p.ver ?? true,
          crear: p.crear ?? false,
          editar: p.editar ?? false,
          eliminar: p.eliminar ?? false,
          exportar: p.exportar ?? false,
        },
      });
    }
  }

  // Devolver todos los permisos actualizados
  const allPermisos = await prisma.permisoSeccion.findMany({
    orderBy: [{ seccion: "asc" }, { rol: "asc" }],
  });
  const allPermisosSeccionUsuario = await prisma.permisoSeccionUsuario.findMany({
    include: { user: { select: { id: true, nombre: true } } },
    orderBy: [{ userId: "asc" }, { seccion: "asc" }],
  });

  return NextResponse.json({ permisos: allPermisos, permisosSeccionUsuario: allPermisosSeccionUsuario });
}
