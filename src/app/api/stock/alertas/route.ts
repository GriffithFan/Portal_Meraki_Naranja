import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

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

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const equipos = await prisma.equipo.findMany({
    select: {
      id: true,
      nombre: true,
      modelo: true,
      categoria: true,
      estado: true,
      cantidad: true,
      ubicacion: true,
      numeroSerie: true,
      asignado: { select: { id: true, nombre: true } },
      predio: { select: { id: true, nombre: true } },
    },
  });

  const porTipo = new Map<string, { tipo: string; minimo: number; total: number; disponible: number; instalado: number; transito: number; noOperativo: number; sinSerie: number }>();
  const porAsignado = new Map<string, { key: string; nombre: string; total: number; disponible: number; instalado: number; noOperativo: number }>();

  for (const equipo of equipos) {
    const cantidad = Math.max(Number(equipo.cantidad || 1), 1);
    const estado = normalize(equipo.estado || "SIN_ESTADO");
    const tipo = resolveTipo(equipo);
    const tipoRow = porTipo.get(tipo) || { tipo, minimo: resolveMinimo(tipo), total: 0, disponible: 0, instalado: 0, transito: 0, noOperativo: 0, sinSerie: 0 };
    tipoRow.total += cantidad;
    if (estado === "DISPONIBLE") tipoRow.disponible += cantidad;
    if (estado === "INSTALADO") tipoRow.instalado += cantidad;
    if (estado === "EN_TRANSITO") tipoRow.transito += cantidad;
    if (["ROTO", "PERDIDO", "EN_REPARACION"].includes(estado)) tipoRow.noOperativo += cantidad;
    if (!equipo.numeroSerie) tipoRow.sinSerie += cantidad;
    porTipo.set(tipo, tipoRow);

    const asignadoKey = equipo.asignado?.id || equipo.ubicacion || equipo.predio?.id || "SIN_ASIGNAR";
    const asignadoNombre = equipo.asignado?.nombre || equipo.ubicacion || equipo.predio?.nombre || "Sin asignar";
    const asignadoRow = porAsignado.get(asignadoKey) || { key: asignadoKey, nombre: asignadoNombre, total: 0, disponible: 0, instalado: 0, noOperativo: 0 };
    asignadoRow.total += cantidad;
    if (estado === "DISPONIBLE") asignadoRow.disponible += cantidad;
    if (estado === "INSTALADO") asignadoRow.instalado += cantidad;
    if (["ROTO", "PERDIDO", "EN_REPARACION"].includes(estado)) asignadoRow.noOperativo += cantidad;
    porAsignado.set(asignadoKey, asignadoRow);
  }

  const tipos = Array.from(porTipo.values())
    .map((item) => ({ ...item, faltante: Math.max(item.minimo - item.disponible, 0), alerta: item.disponible < item.minimo }))
    .sort((a, b) => Number(b.alerta) - Number(a.alerta) || b.faltante - a.faltante || b.total - a.total);
  const alertas = tipos.filter((item) => item.alerta);
  const asignados = Array.from(porAsignado.values()).sort((a, b) => b.total - a.total).slice(0, 12);
  const resumen = {
    total: equipos.reduce((sum, item) => sum + Math.max(Number(item.cantidad || 1), 1), 0),
    tipos: tipos.length,
    alertas: alertas.length,
    disponible: tipos.reduce((sum, item) => sum + item.disponible, 0),
    noOperativo: tipos.reduce((sum, item) => sum + item.noOperativo, 0),
    sinSerie: tipos.reduce((sum, item) => sum + item.sinSerie, 0),
  };

  return NextResponse.json({ generatedAt: new Date().toISOString(), resumen, tipos, alertas, asignados, minimos: MINIMOS_POR_TIPO });
}
