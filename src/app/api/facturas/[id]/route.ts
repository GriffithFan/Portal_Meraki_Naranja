import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;

  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  try {
    const safePath = path.join(process.cwd(), factura.archivoRuta);
    // Validar que no salga del directorio uploads
    const uploadsBase = path.join(process.cwd(), "uploads");
    if (!safePath.startsWith(uploadsBase)) {
      return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
    }

    const fileBuffer = await readFile(safePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": factura.archivoTipo || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(factura.archivoNombre)}"`,
        "Content-Length": String(fileBuffer.length),
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en disco" }, { status: 404 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { id } = await params;

  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  const body = await request.json();
  const EDITABLE = ["estado", "concepto", "numero", "monto", "moneda", "fechaEmision", "notas"];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data: any = {};
  for (const field of EDITABLE) {
    if (body[field] !== undefined) {
      if (field === "monto") data[field] = body[field] ? parseFloat(body[field]) : null;
      else if (field === "fechaEmision") data[field] = body[field] ? new Date(body[field]) : null;
      else data[field] = body[field] || null;
    }
  }

  const updated = await prisma.factura.update({
    where: { id },
    data,
    include: { subidoPor: { select: { id: true, nombre: true } } },
  });

  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const { id } = await params;

  const factura = await prisma.factura.findUnique({ where: { id } });
  if (!factura) return NextResponse.json({ error: "Factura no encontrada" }, { status: 404 });

  await prisma.factura.delete({ where: { id } });

  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR",
      descripcion: `Factura "${factura.concepto}" eliminada`,
      entidad: "FACTURA",
      entidadId: id,
      userId: session.userId,
    },
  });

  return NextResponse.json({ ok: true });
}
