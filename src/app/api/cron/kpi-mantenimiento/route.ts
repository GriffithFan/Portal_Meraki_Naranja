import { NextRequest, NextResponse } from "next/server";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";
import { avisarAdminsFallo } from "@/lib/alertasAdmin";
import { enviarPushYBandeja } from "@/lib/pushNotifications";
import { calcularKpi, excelKpi, textoCorreo } from "@/lib/kpiMantenimiento";

/**
 * GET /api/cron/kpi-mantenimiento
 *
 * Indicador semanal de técnicos activos en incidencias de mantenimiento
 * (pedido de Alberto, con copia a Fernando). Corre los viernes a las 17:30 ART,
 * apenas cierra la semana operativa: arma el Excel, lo deja en uploads/kpi y
 * notifica a los ADMIN con el texto listo para reenviar por correo.
 *
 * ?semanas=N  (default 3) para ampliar el período informado.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  try {
    const n = Math.min(12, Math.max(2, parseInt(request.nextUrl.searchParams.get("semanas") || "3", 10)));
    const datos = await calcularKpi(n);
    const buffer = await excelKpi(datos);
    const texto = textoCorreo(datos);

    const dir = path.join(process.cwd(), "uploads", "kpi");
    await mkdir(dir, { recursive: true });
    const nombre = `Indicador_Tecnicos_Mantenimiento_${datos.ultima.desde}.xlsx`;
    await writeFile(path.join(dir, nombre), buffer);

    const admins = await prisma.user.findMany({ where: { rol: "ADMIN", activo: true }, select: { id: true } });
    const resumen = `${datos.ultima.tecnicos} técnicos · ${datos.ultima.incidencias} incidencias`;
    await Promise.allSettled(
      admins.map((a) =>
        enviarPushYBandeja(a.id, {
          tipo: "KPI_MANTENIMIENTO",
          titulo: "Indicador semanal listo para enviar",
          mensaje: `Semana ${datos.ultima.etiqueta}: ${resumen}. El Excel y el texto del correo están en Reportes.`,
          enlace: "/dashboard/facturacion",
          entidad: "KPI",
          entidadId: datos.ultima.desde,
          tag: `kpi-${datos.ultima.desde}`,
        })
      )
    );

    // el texto del correo queda guardado junto al Excel para copiarlo tal cual
    await writeFile(path.join(dir, `correo_${datos.ultima.desde}.txt`), texto, "utf-8");

    await prisma.actividad.create({
      data: {
        accion: "CREAR",
        descripcion: `Indicador semanal de mantenimiento — semana ${datos.ultima.etiqueta}: ${resumen}`,
        entidad: "KPI",
        entidadId: datos.ultima.desde,
        userId: admins[0]?.id ?? "",
      },
    }).catch(() => {});

    return NextResponse.json({
      ok: true,
      semana: datos.ultima.desde,
      tecnicos: datos.ultima.tecnicos,
      incidencias: datos.ultima.incidencias,
      totalPeriodo: datos.totalPeriodo,
      archivo: `/uploads/kpi/${nombre}`,
      evolucion: datos.semanas.map((s) => ({ semana: s.etiqueta, tecnicos: s.tecnicos, incidencias: s.incidencias })),
    });
  } catch (error) {
    console.error("[CRON KPI mantenimiento] Error:", error);
    await avisarAdminsFallo({
      titulo: "Falló el indicador semanal de mantenimiento",
      mensaje: (error as Error)?.message?.slice(0, 300) || "Error generando el indicador",
      enlace: "/dashboard",
      tag: "cron-kpi-mantenimiento",
    });
    return NextResponse.json({ error: "Error generando el indicador" }, { status: 500 });
  }
}
