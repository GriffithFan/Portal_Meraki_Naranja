import { NextRequest, NextResponse } from "next/server";
import { readFile, readdir } from "fs/promises";
import path from "path";
import { getSession, isAdmin } from "@/lib/auth";
import { calcularKpi, excelKpi, textoCorreo } from "@/lib/kpiMantenimiento";

/**
 * GET /api/kpi-mantenimiento            → datos + texto del correo (JSON)
 * GET /api/kpi-mantenimiento?excel=1    → descarga el Excel al vuelo
 * GET /api/kpi-mantenimiento?listar=1   → informes ya generados por el cron
 *
 * Solo ADMIN: es el indicador que se publica a dirección.
 */
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const sp = request.nextUrl.searchParams;
  const dir = path.join(process.cwd(), "uploads", "kpi");

  if (sp.get("listar") === "1") {
    try {
      const files = await readdir(dir);
      return NextResponse.json({
        informes: files.filter((f) => f.endsWith(".xlsx")).sort().reverse(),
      });
    } catch {
      return NextResponse.json({ informes: [] });
    }
  }

  // descarga de un informe ya generado
  const archivo = sp.get("archivo");
  if (archivo) {
    if (archivo.includes("..") || archivo.includes("/") || archivo.includes("\\")) {
      return NextResponse.json({ error: "Nombre inválido" }, { status: 400 });
    }
    try {
      const buf = await readFile(path.join(dir, archivo));
      return new NextResponse(buf as unknown as BodyInit, {
        headers: {
          "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "Content-Disposition": `attachment; filename="${encodeURIComponent(archivo)}"`,
        },
      });
    } catch {
      return NextResponse.json({ error: "No se encontró el informe" }, { status: 404 });
    }
  }

  const semanas = Math.min(12, Math.max(2, parseInt(sp.get("semanas") || "3", 10)));
  // ?enCurso=1 agrega la semana que todavía no cerró, con lo que va hasta ahora.
  const datos = await calcularKpi(semanas, sp.get("enCurso") === "1");

  if (sp.get("excel") === "1") {
    const buf = await excelKpi(datos);
    const nombre = `Indicador_Tecnicos_Mantenimiento_${datos.ultima.desde}.xlsx`;
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(nombre)}"`,
      },
    });
  }

  return NextResponse.json({ ...datos, correo: textoCorreo(datos) });
}
