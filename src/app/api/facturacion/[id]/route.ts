import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { readFile, unlink } from "fs/promises";
import path from "path";

/**
 * GET /api/facturacion/[id] — Descargar CSV o XLSX del reporte (solo ADMIN)
 * Query: ?format=xlsx para Excel, por defecto CSV
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const format = searchParams.get("format") || "csv";

  const reporte = await prisma.reporteFacturacion.findUnique({ where: { id } });
  if (!reporte || !reporte.csvRuta) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  try {
    const baseName = reporte.csvNombre?.replace(".csv", "") || "reporte";
    const uploadsBase = path.join(process.cwd(), "uploads");

    if (format === "xlsx") {
      const xlsxPath = path.join(process.cwd(), "uploads", "reportes", `${baseName}.xlsx`);
      if (!xlsxPath.startsWith(uploadsBase)) {
        return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
      }
      const fileBuffer = await readFile(xlsxPath);
      return new NextResponse(fileBuffer, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(baseName + ".xlsx")}"`,
          "Content-Length": String(fileBuffer.length),
          "X-Content-Type-Options": "nosniff",
        },
      });
    }

    // Default: CSV
    const filePath = path.join(process.cwd(), reporte.csvRuta);
    if (!filePath.startsWith(uploadsBase)) {
      return NextResponse.json({ error: "Ruta inválida" }, { status: 400 });
    }

    const fileBuffer = await readFile(filePath);

    return new NextResponse(fileBuffer, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(reporte.csvNombre || "reporte.csv")}"`,
        "Content-Length": String(fileBuffer.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Archivo no encontrado en disco" }, { status: 404 });
  }
}

/**
 * DELETE /api/facturacion/[id] — Eliminar reporte (solo ADMIN)
 */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN") {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }

  const { id } = await params;
  const reporte = await prisma.reporteFacturacion.findUnique({ where: { id } });
  if (!reporte) {
    return NextResponse.json({ error: "Reporte no encontrado" }, { status: 404 });
  }

  // Eliminar CSV del disco
  if (reporte.csvRuta) {
    try {
      const filePath = path.join(process.cwd(), reporte.csvRuta);
      const uploadsBase = path.join(process.cwd(), "uploads");
      if (filePath.startsWith(uploadsBase)) {
        await unlink(filePath);
      }
    } catch {
      // Archivo ya no existe
    }
  }

  // Guardar en papelera antes de eliminar
  const { registrarEnPapelera } = await import("@/lib/papelera");
  await registrarEnPapelera("FACTURACION", `Reporte semana ${reporte.semana}`, reporte as unknown as Record<string, unknown>, session.userId);

  await prisma.reporteFacturacion.delete({ where: { id } });

  await prisma.actividad.create({
    data: {
      accion: "ELIMINAR",
      descripcion: `Reporte facturación semana ${reporte.semana} eliminado`,
      entidad: "REPORTE",
      entidadId: id,
      userId: session.userId,
    },
  });

  return NextResponse.json({ ok: true });
}
