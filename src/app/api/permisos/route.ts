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

  return NextResponse.json({ permisos });
}

// Secciones configurables (excluye monitoreo que es visible para todos)
const SECCIONES_VALIDAS = [
  "tareas", "calendario", "stock", "importar", "predios", "hospedajes",
  "bandeja", "actividad", "chat", "instructivo", "actas",
  "facturacion", "usuarios", "kpis", "mapa",
];

// PUT: actualizar permisos (solo ADMIN)
export async function PUT(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const data = await parseBody(request, permisosSchema);
  if (isErrorResponse(data)) return data;

  const { permisos } = data;

  // Validar y aplicar cada permiso
  const results = [];
  for (const p of permisos) {
    if (!SECCIONES_VALIDAS.includes(p.seccion)) continue;
    if (!["ADMIN", "MODERADOR", "TECNICO"].includes(p.rol)) continue;

    // Admin SIEMPRE tiene ver y editar — no se puede restringir
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

  return NextResponse.json({ permisos: results });
}
