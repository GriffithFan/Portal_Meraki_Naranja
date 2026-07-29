import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { provinciaDeCodigo, PROVINCIAS_META, PROVINCIAS_ORDEN, type ProvinciaClave } from "@/lib/provincias";
import { estadoVentana, type VentanaEstado } from "@/lib/cronogramaVentana";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

const DIA_MS = 86400000;
const SEMANA_MS = 7 * DIA_MS;
const OBJETIVO_CONFORMES = 150;
const CONFORMIDAD_DEFAULT = 0.85; // fallback si no hay datos suficientes
const ORIGEN_NC = new Set(["enprogreso", "instalado", "auditar"]);

function mondayOf(d: Date): Date {
  const base = new Date(d);
  const day = base.getDay();
  base.setDate(base.getDate() - (day === 0 ? 6 : day - 1));
  base.setHours(0, 0, 0, 0);
  return base;
}
function norm(v?: string | null) {
  return (v || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");
}
function parseTransicion(desc?: string | null): { antes: string; despues: string } | null {
  const m = /Estado:\s*(.+?)\s*->\s*([^;]+)/.exec(desc || "");
  return m ? { antes: norm(m[1]), despues: norm(m[2]) } : null;
}

type VentanaBucket = Record<VentanaEstado, number>;
function bucketVacio(): VentanaBucket {
  return { sin_fechas: 0, futuro: 0, en_ventana: 0, por_vencer: 0, vencido: 0 };
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const semanas = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("semanas") || "8") || 8, 4), 16);
  const now = new Date();
  const startMonday = new Date(mondayOf(now).getTime() - (semanas - 1) * SEMANA_MS);
  const idxActual = semanas - 1;

  // ── 1) Predios NO conformes (pipeline) → ventana × provincia ──
  const predios = await prisma.predio.findMany({
    where: { NOT: { estado: { nombre: { equals: "CONFORME", mode: "insensitive" } } } },
    select: { codigo: true, fechaDesde: true, fechaHasta: true },
    take: 20000,
  });

  const ventanaGlobal = bucketVacio();
  const porProvincia = new Map<ProvinciaClave, VentanaBucket>();
  for (const p of PROVINCIAS_ORDEN) porProvincia.set(p, bucketVacio());
  // "por vencer" detalle: los que vencen en <=3 días (para priorizar)
  let porVencerHoyMan = 0; // vencen hoy o mañana

  for (const p of predios) {
    const prov = provinciaDeCodigo(p.codigo);
    const info = estadoVentana(p.fechaDesde, p.fechaHasta, now);
    ventanaGlobal[info.estado] += 1;
    porProvincia.get(prov)![info.estado] += 1;
    if (info.estado === "por_vencer" && (info.diasRestantes ?? 99) <= 1) porVencerHoyMan += 1;
  }

  // ── 2) Técnicos activos / onboarding ──
  const tecnicosRaw = await prisma.user.findMany({
    where: { OR: [{ tecnicoActivo: true }, { tecnicoDesde: { not: null } }] },
    select: {
      id: true, nombre: true, tecnicoActivo: true, tecnicoDesde: true,
      asignaciones: { where: { tipo: { in: ["TAREA", "TECNICO"] } }, select: { predio: { select: { codigo: true } } } },
    },
  });

  // Provincia dominante de cada técnico (según sus predios asignados).
  const provDominante = (asigns: { predio: { codigo: string | null } | null }[]): ProvinciaClave => {
    const conteo: Record<string, number> = {};
    for (const a of asigns) {
      const pr = provinciaDeCodigo(a.predio?.codigo);
      if (pr === "OTRA") continue;
      conteo[pr] = (conteo[pr] || 0) + 1;
    }
    let mejor: ProvinciaClave = "BA"; let max = -1;
    for (const k of Object.keys(conteo)) if (conteo[k] > max) { max = conteo[k]; mejor = k as ProvinciaClave; }
    return max < 0 ? "BA" : mejor;
  };

  // ── 3) Producción por transición (conformes/NC) atribuida por técnico (User.id) ──
  const tecnicoIds = new Set(tecnicosRaw.map((t) => t.id));
  // Mapa predioId -> técnicos activos asignados (para atribuir la transición).
  const asignActivas = await prisma.asignacion.findMany({
    where: { userId: { in: Array.from(tecnicoIds) }, tipo: { in: ["TAREA", "TECNICO"] } },
    select: { userId: true, predioId: true },
  });
  const tecnicosPorPredio = new Map<string, string[]>();
  for (const a of asignActivas) {
    if (!a.predioId) continue;
    const arr = tecnicosPorPredio.get(a.predioId) || [];
    arr.push(a.userId);
    tecnicosPorPredio.set(a.predioId, arr);
  }

  const acts = await prisma.actividad.findMany({
    where: { entidad: "PREDIO", descripcion: { contains: "Estado:" }, createdAt: { gte: startMonday } },
    select: { entidadId: true, descripcion: true, createdAt: true },
  });

  interface Prod { conformes: number[]; nc: number[] }
  const prodPorTec = new Map<string, Prod>();
  const ensureProd = (id: string): Prod => {
    let p = prodPorTec.get(id);
    if (!p) { p = { conformes: new Array(semanas).fill(0), nc: new Array(semanas).fill(0) }; prodPorTec.set(id, p); }
    return p;
  };
  let confGlobalSemana = 0;
  for (const a of acts) {
    const tr = parseTransicion(a.descripcion);
    if (!tr) continue;
    const esConf = tr.despues === "conforme" && tr.antes !== "conforme";
    const esNc = tr.despues === "noconforme" && ORIGEN_NC.has(tr.antes);
    if (!esConf && !esNc) continue;
    if (esNc) { const dow = a.createdAt.getDay(); if (dow === 0 || dow === 6) continue; }
    const wIdx = Math.floor((mondayOf(a.createdAt).getTime() - startMonday.getTime()) / SEMANA_MS);
    if (wIdx < 0 || wIdx >= semanas) continue;
    if (esConf && wIdx === idxActual) confGlobalSemana += 1;
    for (const tid of tecnicosPorPredio.get(a.entidadId) || []) {
      const p = ensureProd(tid);
      if (esConf) p.conformes[wIdx] += 1; else p.nc[wIdx] += 1;
    }
  }

  // % de conformidad reciente global (últimas semanas completas): conformes / (conformes+nc).
  let confTot = 0, ncTot = 0;
  for (const p of Array.from(prodPorTec.values())) {
    for (let i = 0; i < idxActual; i++) { confTot += p.conformes[i]; ncTot += p.nc[i]; }
  }
  const conformidad = confTot + ncTot > 0 ? confTot / (confTot + ncTot) : CONFORMIDAD_DEFAULT;

  // ── 4) Técnicos armados ──
  const tecnicos = tecnicosRaw.map((t) => {
    const prov = provDominante(t.asignaciones);
    const meta = PROVINCIAS_META[prov];
    const prod = prodPorTec.get(t.id) || { conformes: new Array(semanas).fill(0), nc: new Array(semanas).fill(0) };
    const desde = t.tecnicoDesde ? new Date(t.tecnicoDesde) : null;
    const diasDesde = desde ? Math.floor((now.getTime() - desde.getTime()) / DIA_MS) : null;
    const esNuevo = diasDesde != null && diasDesde >= 0 && diasDesde < 35; // hasta ~5 semanas = ramp
    const semanaRamp = esNuevo && diasDesde != null ? Math.floor(diasDesde / 7) + 1 : null;
    // Objetivo: nuevos arrancan 6 (semana 1) y 7 (semana 2+), acotado por la zona (SF/ER = 5).
    const rampTarget = semanaRamp != null ? (semanaRamp <= 1 ? 6 : 7) : null;
    const objetivo = rampTarget != null ? Math.min(rampTarget, meta.objetivo) : meta.objetivo;
    const conformesSemana = prod.conformes[idxActual] || 0;
    const ncSemana = prod.nc[idxActual] || 0;
    const semaforo = conformesSemana >= objetivo ? "verde" : conformesSemana >= objetivo * 0.6 ? "amarillo" : "rojo";
    return {
      id: t.id, nombre: t.nombre, tecnicoActivo: t.tecnicoActivo,
      tecnicoDesde: t.tecnicoDesde ? new Date(t.tecnicoDesde).toISOString() : null,
      provincia: prov, provinciaNombre: meta.corto, objetivo,
      esNuevo, semanaRamp,
      conformesSemana, ncSemana,
      conformesPorSemana: prod.conformes,
      predios: t.asignaciones.length,
      semaforo,
    };
  }).sort((a, b) => Number(b.tecnicoActivo) - Number(a.tecnicoActivo) || b.conformesSemana - a.conformesSemana || a.nombre.localeCompare(b.nombre, "es"));

  // ── 5) Capacidad y recomendación de pedidos ──
  // Lista completa de técnicos (para el panel de gestión: marcar activos, fecha de inicio).
  const todosTecnicos = (await prisma.user.findMany({
    where: { rol: "TECNICO" },
    select: { id: true, nombre: true, email: true, activo: true, tecnicoActivo: true, tecnicoDesde: true },
    orderBy: [{ tecnicoActivo: "desc" }, { nombre: "asc" }],
  })).map((u) => ({ ...u, tecnicoDesde: u.tecnicoDesde ? new Date(u.tecnicoDesde).toISOString() : null }));

  const activos = tecnicos.filter((t) => t.tecnicoActivo);
  const capacidadSemanal = Math.round(activos.reduce((s, t) => s + t.objetivo, 0));
  const visitasNecesarias = Math.ceil(OBJETIVO_CONFORMES / conformidad);
  const enPipeline = ventanaGlobal.en_ventana + ventanaGlobal.por_vencer + ventanaGlobal.futuro;
  const bufferObjetivo = Math.round(visitasNecesarias * 2); // ~2 semanas de trabajo en ventana/pipeline
  const pedirEstaSemana = Math.max(0, bufferObjetivo - enPipeline);

  return NextResponse.json({
    generatedAt: now.toISOString(),
    objetivoConformes: OBJETIVO_CONFORMES,
    conformidadPct: Math.round(conformidad * 100),
    conformesSemanaGlobal: confGlobalSemana,
    ventanaGlobal,
    porVencerHoyMan,
    provincias: PROVINCIAS_ORDEN.map((clave) => ({
      clave, nombre: PROVINCIAS_META[clave].nombre, corto: PROVINCIAS_META[clave].corto,
      objetivoLabel: PROVINCIAS_META[clave].objetivoLabel,
      ...porProvincia.get(clave)!,
    })),
    capacidad: {
      tecnicosActivos: activos.length,
      capacidadSemanal,
      objetivo: OBJETIVO_CONFORMES,
      gap: OBJETIVO_CONFORMES - capacidadSemanal,
    },
    pedidos: {
      conformidadPct: Math.round(conformidad * 100),
      visitasNecesarias,
      enPipeline,
      bufferObjetivo,
      pedirEstaSemana,
      enVentana: ventanaGlobal.en_ventana,
      porVencer: ventanaGlobal.por_vencer,
      vencidos: ventanaGlobal.vencido,
    },
    tecnicos,
    todosTecnicos,
  }, { headers: { "Cache-Control": "no-store" } });
}

// PATCH { userId, tecnicoActivo?, tecnicoDesde? } — marca técnico activo / fecha de inicio productivo.
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const userId = String(body?.userId || "");
  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });

  const data: any = {};
  if (typeof body.tecnicoActivo === "boolean") data.tecnicoActivo = body.tecnicoActivo;
  if (body.tecnicoDesde !== undefined) {
    if (body.tecnicoDesde === null || body.tecnicoDesde === "") data.tecnicoDesde = null;
    else {
      const d = new Date(body.tecnicoDesde);
      if (isNaN(d.getTime())) return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
      data.tecnicoDesde = d;
    }
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: "Nada para actualizar" }, { status: 400 });

  const u = await prisma.user.update({
    where: { id: userId },
    data,
    select: { id: true, nombre: true, tecnicoActivo: true, tecnicoDesde: true },
  });
  return NextResponse.json(u);
}
