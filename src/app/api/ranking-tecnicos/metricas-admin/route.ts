import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { prediosFacturadosHasta, yaFueFacturado } from "@/lib/prediosFacturados";
import { getSession } from "@/lib/auth";
import { getEquipoDisplayName, normalizeAssigneeName, resolveEquipoKey } from "@/utils/equipoUtils";
import { inicioSemana, SEMANA_MS } from "@/lib/semanaRanking";

export const dynamic = "force-dynamic";

const OBJETIVO_SEMANAL = 7; // conformes/semana por técnico

// Estados de origen que sí cuentan como NC "de trabajo" cuando pasan a NO CONFORME.
// (Excluye actualizar el LAC de NO a SÍ, que no genera esta transición de estado.)
const ORIGEN_NC = new Set(["enprogreso", "instalado", "auditar"]);

function getISOWeek(date: Date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNumber = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNumber);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((target.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function normalizeText(value?: string | null) {
  return (value || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[_\s-]+/g, "");
}

// "Estado: <ANTES> -> <DESPUÉS>" (puede venir seguido de "; <otro campo>").
function parseTransicion(desc?: string | null): { antes: string; despues: string } | null {
  const m = /Estado:\s*(.+?)\s*->\s*([^;]+)/.exec(desc || "");
  if (!m) return null;
  return { antes: normalizeText(m[1]), despues: normalizeText(m[2]) };
}

// Estrellas: combina cantidad (promedio de conformes/semana) y tasa de conformidad
// (conformes / (conformes + NC)) sobre las últimas semanas completas.
function estrellas(avgConformes: number, avgNc: number): number {
  const rate = avgConformes + avgNc > 0 ? avgConformes / (avgConformes + avgNc) : 0;
  if (avgConformes >= 15 && rate >= 0.85) return 5;
  if (avgConformes >= 10 && rate >= 0.75) return 4;
  if (avgConformes >= OBJETIVO_SEMANAL && rate >= 0.6) return 3;
  if (avgConformes >= 4) return 2;
  return 1;
}

type Target = { tecnicoId: string; nombre: string; equipoKey: string };
type Serie = {
  tecnicoId: string; nombre: string; equipoKey: string;
  conformesPorSemana: number[]; ncPorSemana: number[];
  conformesHistorico: number; ncHistorico: number;
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  // SOLO admin: la vista de técnicos no incluye estas métricas internas.
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const semanas = Math.min(Math.max(parseInt(new URL(request.url).searchParams.get("semanas") || "8") || 8, 4), 16);
  const now = new Date();
  const startMonday = new Date(inicioSemana(now).getTime() - (semanas - 1) * SEMANA_MS);
  const idxActual = semanas - 1;
  const semanasMeta = Array.from({ length: semanas }, (_, i) => {
    const desde = new Date(startMonday.getTime() + i * SEMANA_MS);
    return { label: getISOWeek(desde), desde: desde.toISOString() };
  });

  // 1) Todas las transiciones de estado (log explícito: entidad "PREDIO" en mayúsculas).
  const acts = await prisma.actividad.findMany({
    where: { entidad: "PREDIO", descripcion: { contains: "Estado:" } },
    select: { entidadId: true, descripcion: true, createdAt: true },
  });

  // 2) Predios referenciados -> técnico(s) asignado(s) (mismo merge de equipos que el ranking).
  const predioIds = Array.from(new Set(acts.map((a) => a.entidadId).filter(Boolean)));
  const predios = predioIds.length
    ? await prisma.predio.findMany({
        where: { id: { in: predioIds } },
        select: {
          id: true,
          asignaciones: {
            where: { tipo: { in: ["TAREA", "TECNICO"] } },
            select: { usuario: { select: { id: true, nombre: true, rol: true, activo: true } } },
          },
        },
      })
    : [];

  const targetsPorPredio = new Map<string, Target[]>();
  for (const p of predios) {
    const uniq = new Map<string, Target>();
    for (const asig of p.asignaciones) {
      const u = asig.usuario;
      if (!u || u.activo === false || u.rol !== "TECNICO") continue;
      const resolvedKey = resolveEquipoKey(u.nombre);
      const mergeKey = resolvedKey || normalizeAssigneeName(u.nombre) || u.id;
      if (!mergeKey || uniq.has(mergeKey)) continue;
      const equipoKey = resolvedKey || u.nombre;
      uniq.set(mergeKey, { tecnicoId: mergeKey, nombre: getEquipoDisplayName(equipoKey), equipoKey });
    }
    targetsPorPredio.set(p.id, Array.from(uniq.values()));
  }

  // 3) Recorrer transiciones y acumular.
  const series = new Map<string, Serie>();
  const gConfSem = new Array(semanas).fill(0);
  const gNcSem = new Array(semanas).fill(0);
  let gConfHist = 0;
  let gNcHist = 0;

  const ensureSerie = (t: Target): Serie => {
    let s = series.get(t.tecnicoId);
    if (!s) {
      s = {
        tecnicoId: t.tecnicoId, nombre: t.nombre, equipoKey: t.equipoKey,
        conformesPorSemana: new Array(semanas).fill(0), ncPorSemana: new Array(semanas).fill(0),
        conformesHistorico: 0, ncHistorico: 0,
      };
      series.set(t.tecnicoId, s);
    }
    return s;
  };

  // Re-conformidades de predios YA FACTURADOS: no cuentan. Si alguien mueve un predio
  // facturado a INSTALADO y lo devuelve a CONFORME se genera una transicion nueva que
  // sumaria de nuevo, en una semana en la que no se trabajo. Paso el 21/08/2026.
  const facturados = await prediosFacturadosHasta();

  for (const a of acts) {
    const tr = parseTransicion(a.descripcion);
    if (!tr) continue;
    const esConforme = tr.despues === "conforme" && tr.antes !== "conforme";
    const esNc = tr.despues === "noconforme" && ORIGEN_NC.has(tr.antes);
    if (!esConforme && !esNc) continue;
    // Solo se suprime la re-conformidad. Un NC posterior a la facturacion es un
    // rechazo real de trabajo ya cobrado y tiene que quedar a la vista.
    if (esConforme && yaFueFacturado(facturados, a.entidadId, a.createdAt)) continue;

    const fecha = a.createdAt;
    // NC: solo cuenta de lunes a viernes (getDay 1..5).
    if (esNc) { const dow = fecha.getDay(); if (dow === 0 || dow === 6) continue; }

    const wIdx = Math.floor((inicioSemana(fecha).getTime() - startMonday.getTime()) / SEMANA_MS);
    const enRango = wIdx >= 0 && wIdx < semanas;

    // Global (una vez por evento, incluso si el predio no tiene técnico).
    if (esConforme) { gConfHist += 1; if (enRango) gConfSem[wIdx] += 1; }
    else { gNcHist += 1; if (enRango) gNcSem[wIdx] += 1; }

    // Por técnico (atribuido a cada técnico asignado actual del predio).
    for (const t of targetsPorPredio.get(a.entidadId) || []) {
      const s = ensureSerie(t);
      if (esConforme) { s.conformesHistorico += 1; if (enRango) s.conformesPorSemana[wIdx] += 1; }
      else { s.ncHistorico += 1; if (enRango) s.ncPorSemana[wIdx] += 1; }
    }
  }

  // 4) Promedio sobre las últimas (hasta 4) semanas COMPLETAS (excluye la actual, en curso).
  const ventanaCompletas = (arr: number[]): number[] => {
    const completas = arr.slice(0, idxActual);
    const ventana = completas.slice(-4);
    return ventana.length ? ventana : [arr[idxActual] || 0];
  };
  const promedio = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0);

  const tecnicos = Array.from(series.values())
    .filter((s) => s.conformesHistorico > 0 || s.ncHistorico > 0)
    .map((s) => {
      const avgC = promedio(ventanaCompletas(s.conformesPorSemana));
      const avgN = promedio(ventanaCompletas(s.ncPorSemana));
      const rate = avgC + avgN > 0 ? Math.round((avgC / (avgC + avgN)) * 100) : 0;
      return {
        tecnicoId: s.tecnicoId, nombre: s.nombre, equipoKey: s.equipoKey,
        conformesPorSemana: s.conformesPorSemana, ncPorSemana: s.ncPorSemana,
        conformesSemana: s.conformesPorSemana[idxActual] || 0,
        ncSemana: s.ncPorSemana[idxActual] || 0,
        conformesHistorico: s.conformesHistorico, ncHistorico: s.ncHistorico,
        promedioConformes: Math.round(avgC * 10) / 10,
        tasaConformidad: rate,
        estrellas: estrellas(avgC, avgN),
      };
    })
    .sort((a, b) =>
      b.estrellas - a.estrellas ||
      b.conformesSemana - a.conformesSemana ||
      b.conformesHistorico - a.conformesHistorico ||
      a.nombre.localeCompare(b.nombre, "es")
    );

  return NextResponse.json({
    generatedAt: now.toISOString(),
    objetivo: OBJETIVO_SEMANAL,
    semanas: semanasMeta,
    global: {
      conformesPorSemana: gConfSem, ncPorSemana: gNcSem,
      conformesSemana: gConfSem[idxActual] || 0, ncSemana: gNcSem[idxActual] || 0,
      conformesHistorico: gConfHist, ncHistorico: gNcHist,
    },
    tecnicos,
  }, { headers: { "Cache-Control": "no-store" } });
}
