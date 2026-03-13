import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { readFile, unlink } from "fs/promises";
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

    // Forzar Content-Type seguro — nunca confiar en el valor del cliente
    const SAFE_MIME: Record<string, string> = {
      ".pdf": "application/pdf",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".webp": "image/webp",
      ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ".xls": "application/vnd.ms-excel",
    };
    const ext = path.extname(factura.archivoRuta).toLowerCase();
    const safeContentType = SAFE_MIME[ext] || "application/octet-stream";

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": safeContentType,
        "Content-Disposition": `attachment; filename="${encodeURIComponent(factura.archivoNombre)}"`,
        "Content-Length": String(fileBuffer.length),
        "X-Content-Type-Options": "nosniff",
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

  // Validar transiciones de estado permitidas
  const TRANSICIONES_VALIDAS: Record<string, string[]> = {
    PENDIENTE: ["APROBADA", "RECHAZADA"],
    APROBADA: ["PAGADA", "RECHAZADA"],
    RECHAZADA: ["PENDIENTE"],
    PAGADA: [],  // Estado final — no se puede cambiar
  };

  if (body.estado !== undefined && body.estado !== factura.estado) {
    const permitidos = TRANSICIONES_VALIDAS[factura.estado] || [];
    if (!permitidos.includes(body.estado)) {
      return NextResponse.json(
        { error: `No se puede cambiar de ${factura.estado} a ${body.estado}` },
        { status: 400 }
      );
    }
  }

  const EDITABLE = ["estado", "concepto", "numero", "monto", "moneda", "fechaEmision", "notas"];

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const data: any = {};
  const cambios: string[] = [];
  for (const field of EDITABLE) {
    if (body[field] !== undefined) {
      const valorAnterior = (factura as any)[field];
      if (field === "monto") {
        data[field] = body[field] ? parseFloat(body[field]) : null;
      } else if (field === "fechaEmision") {
        data[field] = body[field] ? new Date(body[field]) : null;
      } else {
        data[field] = body[field] || null;
      }
      if (String(valorAnterior) !== String(data[field])) {
        cambios.push(`${field}: ${valorAnterior ?? "(vacío)"} → ${data[field] ?? "(vacío)"}`);
      }
    }
  }

  const updated = await prisma.factura.update({
    where: { id },
    data,
    include: { subidoPor: { select: { id: true, nombre: true } } },
  });

  // Registrar cambios en auditoría
  if (cambios.length > 0) {
    await prisma.actividad.create({
      data: {
        accion: "EDITAR",
        descripcion: `Factura "${factura.concepto}" modificada: ${cambios.join(", ")}`,
        entidad: "FACTURA",
        entidadId: id,
        userId: session.userId,
      },
    });
  }

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

  // Eliminar archivo del disco
  try {
    const filePath = path.join(process.cwd(), factura.archivoRuta);
    const uploadsBase = path.join(process.cwd(), "uploads");
    if (filePath.startsWith(uploadsBase)) {
      await unlink(filePath);
    }
  } catch {
    // Si el archivo ya no existe, continuar con la eliminación del registro
  }

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
