import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyCronAuth } from "@/lib/cronAuth";

const MINIMOS_POR_TIPO: Record<string, number> = {
  AP: 10,
  SWITCH: 2,
  UTM: 1,
  GATEWAY: 1,
  OTRO: 1,
};

function normalize(value?: string | null) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .trim();
}

function resolveTipo(equipo: { nombre: string; categoria: string | null; modelo: string | null }) {
  const text = `${normalize(equipo.nombre)} ${normalize(equipo.categoria)} ${normalize(equipo.modelo)}`;
  if (/\b(AP|MR\d+)/.test(text)) return "AP";
  if (/\b(SWITCH|MS\d+)/.test(text)) return "SWITCH";
  if (/\b(UTM|MX\d+)/.test(text)) return "UTM";
  if (/\b(GATEWAY|Z\d+)/.test(text)) return "GATEWAY";
  return normalize(equipo.categoria) || normalize(equipo.nombre) || "OTRO";
}

function resolveMinimo(tipo: string) {
  return MINIMOS_POR_TIPO[tipo] ?? MINIMOS_POR_TIPO.OTRO;
}

function getPeriod(tipo: string) {
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);

  if (tipo === "semanal") {
    const day = start.getDay();
    const diff = day === 0 ? 6 : day - 1;
    start.setDate(start.getDate() - diff);
  }

  const keyDate = start.toISOString().slice(0, 10);
  return {
    now,
    start,
    tipo: tipo === "semanal" ? "semanal" : "diario",
    key: `${tipo === "semanal" ? "semanal" : "diario"}-${keyDate}`,
    label: tipo === "semanal" ? "Resumen semanal" : "Resumen diario",
  };
}

async function getStockSummary() {
  const equipos = await prisma.equipo.findMany({
    select: { nombre: true, categoria: true, modelo: true, estado: true, cantidad: true, numeroSerie: true },
  });

  const porTipo = new Map<string, { tipo: string; minimo: number; disponible: number; total: number; noOperativo: number; sinSerie: number }>();

  for (const equipo of equipos) {
    const cantidad = Math.max(Number(equipo.cantidad || 1), 1);
    const estado = normalize(equipo.estado || "SIN_ESTADO");
    const tipo = resolveTipo(equipo);
    const row = porTipo.get(tipo) || { tipo, minimo: resolveMinimo(tipo), disponible: 0, total: 0, noOperativo: 0, sinSerie: 0 };
    row.total += cantidad;
    if (estado === "DISPONIBLE") row.disponible += cantidad;
    if (["ROTO", "PERDIDO", "EN_REPARACION"].includes(estado)) row.noOperativo += cantidad;
    if (!equipo.numeroSerie) row.sinSerie += cantidad;
    porTipo.set(tipo, row);
  }

  const tipos = Array.from(porTipo.values()).map((item) => ({
    ...item,
    faltante: Math.max(item.minimo - item.disponible, 0),
    alerta: item.disponible < item.minimo,
  }));

  return {
    total: tipos.reduce((sum, item) => sum + item.total, 0),
    alertas: tipos.filter((item) => item.alerta).length,
    noOperativo: tipos.reduce((sum, item) => sum + item.noOperativo, 0),
    sinSerie: tipos.reduce((sum, item) => sum + item.sinSerie, 0),
  };
}

async function safeCount(promise: Promise<number>) {
  try {
    return await promise;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2021") return 0;
    throw error;
  }
}

function buildMensaje(data: {
  label: string;
  prediosTotal: number;
  actualizados: number;
  vencidos: number;
  sinEstado: number;
  sinEquipo: number;
  sinGPS: number;
  chatsAbiertos: number;
  chatsEnCurso: number;
  actividad: number;
  stock: Awaited<ReturnType<typeof getStockSummary>>;
}) {
  return [
    `${data.label}: ${data.prediosTotal} tareas, ${data.actualizados} actualizadas en el periodo y ${data.vencidos} vencidas.`,
    `Pendientes de calidad: ${data.sinEstado} sin estado, ${data.sinEquipo} sin equipo, ${data.sinGPS} sin GPS.`,
    `Comunicación: ${data.chatsAbiertos} chats abiertos, ${data.chatsEnCurso} en curso.`,
    `Stock: ${data.stock.alertas} alertas, ${data.stock.noOperativo} no operativos, ${data.stock.sinSerie} sin serie.`,
    `Actividad registrada: ${data.actividad} eventos.`,
  ].join(" ");
}

export async function GET(request: NextRequest) {
  const authError = verifyCronAuth(request);
  if (authError) return authError;

  const { searchParams } = new URL(request.url);
  const period = getPeriod(searchParams.get("tipo") || "diario");
  const dryRun = searchParams.get("dryRun") === "true";

  try {
    const [
      destinatarios,
      prediosTotal,
      actualizados,
      vencidos,
      sinEstado,
      sinEquipo,
      sinGPS,
      chatsAbiertos,
      chatsEnCurso,
      actividad,
      stock,
    ] = await Promise.all([
      prisma.user.findMany({
        where: { activo: true, rol: { in: ["ADMIN", "MODERADOR"] } },
        select: { id: true, nombre: true, rol: true },
      }),
      prisma.predio.count(),
      prisma.predio.count({ where: { updatedAt: { gte: period.start } } }),
      prisma.predio.count({ where: { fechaHasta: { lt: period.now } } }),
      prisma.predio.count({ where: { estadoId: null } }),
      prisma.predio.count({ where: { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] } }),
      prisma.predio.count({
        where: {
          AND: [
            { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
            { OR: [{ latitud: null }, { longitud: null }] },
          ],
        },
      }),
      safeCount(prisma.chatConversacion.count({ where: { estado: "ABIERTA" } })),
      safeCount(prisma.chatConversacion.count({ where: { estado: "EN_CURSO" } })),
      prisma.actividad.count({ where: { createdAt: { gte: period.start } } }),
      getStockSummary(),
    ]);

    const mensaje = buildMensaje({
      label: period.label,
      prediosTotal,
      actualizados,
      vencidos,
      sinEstado,
      sinEquipo,
      sinGPS,
      chatsAbiertos,
      chatsEnCurso,
      actividad,
      stock,
    });

    const entidad = "REPORTE_OPERATIVO";
    const entidadId = period.key;
    const existentes = await prisma.notificacion.findMany({
      where: { entidad, entidadId, userId: { in: destinatarios.map((user) => user.id) } },
      select: { userId: true },
    });
    const existentesSet = new Set(existentes.map((item) => item.userId));
    const pendientes = destinatarios.filter((user) => !existentesSet.has(user.id));

    if (!dryRun && pendientes.length > 0) {
      await prisma.notificacion.createMany({
        data: pendientes.map((user) => ({
          tipo: "REPORTE",
          titulo: period.label,
          mensaje,
          userId: user.id,
          enlace: "/dashboard/operacion",
          entidad,
          entidadId,
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      tipo: period.tipo,
      periodo: { key: period.key, desde: period.start.toISOString(), hasta: period.now.toISOString() },
      destinatarios: destinatarios.length,
      creadas: dryRun ? 0 : pendientes.length,
      omitidasPorDuplicado: existentes.length,
      resumen: {
        prediosTotal,
        actualizados,
        vencidos,
        sinEstado,
        sinEquipo,
        sinGPS,
        chatsAbiertos,
        chatsEnCurso,
        actividad,
        stock,
      },
    });
  } catch (error) {
    console.error("[CRON Reportes] Error:", error);
    return NextResponse.json({ error: "Error generando reporte" }, { status: 500 });
  }
}