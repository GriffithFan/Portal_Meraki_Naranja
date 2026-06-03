import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

const ALLOWED_FIELDS = ["estado", "asignadoId", "ubicacion", "proveedor", "categoria", "etiqueta", "etiquetaColor"];

const BULK_FIELD_LABELS: Record<string, string> = {
  estado: "Estado", asignadoId: "Asignado", ubicacion: "Ubicación",
  proveedor: "Proveedor", categoria: "Categoría", etiqueta: "Etiqueta", etiquetaColor: "Color",
};

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const { ids, field, value } = body as { ids?: unknown; field?: unknown; value?: unknown };

  if (!Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json({ error: "ids debe ser un arreglo no vacío" }, { status: 400 });
  }
  if (typeof field !== "string" || !ALLOWED_FIELDS.includes(field)) {
    return NextResponse.json({ error: `Campo no permitido: ${field}` }, { status: 400 });
  }
  if (ids.length > 500) {
    return NextResponse.json({ error: "Máximo 500 equipos por operación" }, { status: 400 });
  }
  // Validate ids are strings (CUID-like)
  if (!ids.every((id) => typeof id === "string" && id.length > 0)) {
    return NextResponse.json({ error: "ids inválidos" }, { status: 400 });
  }

  const updateData: Record<string, unknown> = {
    [field]: value === "" || value === null ? null : value,
  };

  const result = await prisma.equipo.updateMany({
    where: { id: { in: ids as string[] } },
    data: updateData,
  });

  // Resolver nombre legible del valor (especialmente para asignadoId)
  let valueDisplay: string = value != null ? String(value) : "vacío";
  if (field === "asignadoId" && value) {
    const user = await prisma.user.findUnique({ where: { id: value as string }, select: { nombre: true } });
    valueDisplay = user?.nombre ?? valueDisplay;
  }
  const fieldLabel = BULK_FIELD_LABELS[field as string] || field;

  // Log de actividad: un registro por equipo para que aparezca en el historial individual
  await prisma.actividad.createMany({
    data: (ids as string[]).map((equipoId) => ({
      accion: "ACTUALIZAR",
      descripcion: `Modificación masiva — ${fieldLabel}: ${valueDisplay}`,
      entidad: "EQUIPO",
      entidadId: equipoId,
      userId: session.userId,
    })),
  });

  return NextResponse.json({ success: true, count: result.count });
}
