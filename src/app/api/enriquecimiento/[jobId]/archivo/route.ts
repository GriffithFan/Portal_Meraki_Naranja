import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { readFile } from "fs/promises";
import path from "path";

// GET /api/enriquecimiento/[jobId]/archivo?tipo=salida|entrada — descarga el
// Excel de una corrida (salida del extractor o entrada generada). Solo ADMIN.
export async function GET(request: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const session = await getSession();
  if (!session || session.rol !== "ADMIN")
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { jobId } = await params;
  const tipo = request.nextUrl.searchParams.get("tipo") === "entrada" ? "entrada" : "salida";
  const job = await prisma.enriquecimientoJob.findUnique({
    where: { id: jobId },
    select: { archivoEntrada: true, archivoSalida: true, createdAt: true },
  });
  if (!job) return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });

  const ruta = tipo === "entrada" ? job.archivoEntrada : job.archivoSalida;
  if (!ruta) return NextResponse.json({ error: `Esta corrida no tiene archivo de ${tipo}` }, { status: 404 });

  const baseDir = path.resolve(process.cwd(), "uploads", "enriquecimiento");
  const filePath = path.resolve(process.cwd(), ruta.replace(/^\/+/, ""));
  if (!filePath.startsWith(baseDir)) {
    return NextResponse.json({ error: "Ruta no permitida" }, { status: 403 });
  }

  try {
    const buf = await readFile(filePath);
    const fecha = job.createdAt.toISOString().slice(0, 10);
    return new NextResponse(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="enriquecimiento_${tipo}_${fecha}.xlsx"`,
        "Content-Length": String(buf.length),
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "El archivo ya no está en el servidor" }, { status: 404 });
  }
}
