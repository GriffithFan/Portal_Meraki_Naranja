"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type RankingRow = {
  tecnicoId: string;
  tecnicoNombre: string;
  equipoKey: string;
  instaladosAuditar: number;
  conformes: number;
  noConformes: number;
  total: number;
  puesto: number;
  esGanadorViernes: boolean;
};

type RankingData = {
  generatedAt: string;
  offset: number;
  isCurrentWeek: boolean;
  semana: string;
  desde: string;
  hasta: string;
  isFriday: boolean;
  resumen: { instaladosAuditar: number; conformes: number; noConformes: number; total: number };
  ranking: RankingRow[];
};

type SerieTecnico = {
  tecnicoId: string;
  nombre: string;
  equipoKey: string;
  conformesPorSemana: number[];
  totalPorSemana: number[];
};

type EvolucionData = {
  semanas: { label: string; desde: string }[];
  global: { conformesPorSemana: number[]; totalPorSemana: number[] };
  tecnicos: SerieTecnico[];
};

const CrownIcon = ({ className = "w-5 h-5" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 18.75h15m-13.5 0L4.5 7.5l5.25 4.5L12 5.25 14.25 12l5.25-4.5-1.5 11.25" />
  </svg>
);

const RefreshIcon = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992V4.356M20.49 9A9 9 0 105.64 18.36M20.49 9a8.96 8.96 0 00-1.642-2.064" />
  </svg>
);

export default function RankingTecnicosPage() {
  const [data, setData] = useState<RankingData | null>(null);
  const [evolucion, setEvolucion] = useState<EvolucionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0); // 0 = semana actual; 1 = semana pasada; etc.

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/ranking-tecnicos?offset=${offset}`, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "No autenticado" : "No se pudo cargar el ranking");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el ranking");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [offset]);

  const fetchEvolucion = useCallback(async () => {
    try {
      const res = await fetch(`/api/ranking-tecnicos/evolucion?semanas=8`, { credentials: "include", cache: "no-store" });
      if (res.ok) setEvolucion(await res.json());
    } catch { /* la evolución es opcional; no rompe la vista */ }
  }, []);

  useEffect(() => {
    fetchData();
    // Auto-refresco solo en la semana actual (las pasadas ya están cerradas).
    if (offset !== 0) return;
    const interval = window.setInterval(() => fetchData(true), 60000);
    return () => window.clearInterval(interval);
  }, [fetchData, offset]);

  useEffect(() => { fetchEvolucion(); }, [fetchEvolucion]);

  // Series de evolución indexadas por técnico (mismo tecnicoId que el ranking).
  const seriePorTecnico = useMemo(() => {
    const map = new Map<string, SerieTecnico>();
    evolucion?.tecnicos.forEach((s) => map.set(s.tecnicoId, s));
    return map;
  }, [evolucion]);

  const topConformes = data?.ranking[0]?.conformes || 0;
  const dateRange = useMemo(() => {
    if (!data) return "";
    const options: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit" };
    return `${new Date(data.desde).toLocaleDateString("es-AR", options)} - ${new Date(data.hasta).toLocaleDateString("es-AR", options)}`;
  }, [data]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl animate-fade-in-up space-y-4">
        <div className="h-7 w-52 rounded bg-surface-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[...Array(4)].map((_, index) => <div key={index} className="h-24 rounded-lg border border-surface-200 bg-white animate-pulse" />)}
        </div>
        <div className="space-y-3">
          {[...Array(5)].map((_, index) => <div key={index} className="h-32 rounded-lg border border-surface-200 bg-white animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-center text-surface-400">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={() => fetchData()} className="mt-3 rounded-md border border-surface-200 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl animate-fade-in-up space-y-4 sm:space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-surface-800">Ranking semanal</h1>
            {data.isFriday && data.isCurrentWeek && topConformes > 0 && <CrownIcon className="h-5 w-5 text-amber-500" />}
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <button
              onClick={() => setOffset((o) => Math.min(o + 1, 52))}
              title="Semana anterior"
              className="rounded-md border border-surface-200 bg-white px-2 py-1 text-surface-500 transition-colors hover:bg-surface-50"
            >
              ‹
            </button>
            <span className="text-xs font-medium text-surface-600">
              {data.isCurrentWeek ? "Semana actual" : offset === 1 ? "Semana pasada" : `Hace ${offset} semanas`}
            </span>
            <button
              onClick={() => setOffset((o) => Math.max(o - 1, 0))}
              disabled={offset === 0}
              title="Semana siguiente"
              className="rounded-md border border-surface-200 bg-white px-2 py-1 text-surface-500 transition-colors hover:bg-surface-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ›
            </button>
            <span className="text-xs text-surface-400">· {dateRange} · {data.semana}</span>
            {offset !== 0 && (
              <button
                onClick={() => setOffset(0)}
                className="ml-1 rounded-md px-2 py-1 text-[11px] font-medium text-primary-600 transition-colors hover:bg-primary-50"
              >
                Volver a hoy
              </button>
            )}
          </div>
        </div>
        <button
          onClick={() => fetchData(true)}
          disabled={refreshing}
          className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-surface-200 bg-white px-3 py-2 text-xs font-medium text-surface-600 transition-colors hover:bg-surface-50 disabled:opacity-60 sm:w-auto"
        >
          <RefreshIcon className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total" value={data.resumen.total} />
        <Stat label="Inst./Auditar" value={data.resumen.instaladosAuditar} tone="primary" />
        <Stat label="Conformes" value={data.resumen.conformes} tone="success" />
        <Stat label="No conformes" value={data.resumen.noConformes} tone="danger" />
      </div>

      {evolucion && evolucion.global.conformesPorSemana.some((n) => n > 0) && (
        <EvolucionGlobal evolucion={evolucion} />
      )}

      {data.ranking.length === 0 ? (
        <section className="rounded-lg border border-surface-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-surface-700">Sin actividad en esta semana</p>
          <p className="mt-1 text-xs text-surface-400">{data.isCurrentWeek ? "El ranking aparece cuando haya movimientos de esta semana." : "No hubo movimientos registrados en esta semana."}</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.ranking.map((tecnico) => (
            <RankingCard key={tecnico.tecnicoId} tecnico={tecnico} maxConformes={topConformes} serie={seriePorTecnico.get(tecnico.tecnicoId)} />
          ))}
        </div>
      )}
    </div>
  );
}

// Sparkline SVG simple (sin dependencias): dibuja la serie normalizada.
function Sparkline({ values, width = 72, height = 22, stroke = "#10b981" }: { values: number[]; width?: number; height?: number; stroke?: string }) {
  if (!values || values.length === 0) return null;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => {
    const x = i * stepX;
    const y = height - 2 - (v / max) * (height - 4);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const areaPts = `0,${height} ${pts.join(" ")} ${width},${height}`;
  const lastX = (values.length - 1) * stepX;
  const lastY = height - 2 - (values[values.length - 1] / max) * (height - 4);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden>
      <polygon points={areaPts} fill={stroke} opacity={0.12} />
      <polyline points={pts.join(" ")} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={lastX} cy={lastY} r={2} fill={stroke} />
    </svg>
  );
}

// Delta entre las dos últimas semanas cerradas (la última de la serie está en curso).
function deltaSemanal(values: number[]): { delta: number; hayDatos: boolean } {
  if (!values || values.length < 3) return { delta: 0, hayDatos: false };
  const ultimaCerrada = values[values.length - 2];
  const previa = values[values.length - 3];
  return { delta: ultimaCerrada - previa, hayDatos: true };
}

function DeltaBadge({ values }: { values: number[] }) {
  const { delta, hayDatos } = deltaSemanal(values);
  if (!hayDatos || delta === 0) {
    return <span className="text-[10px] font-medium text-surface-400">→ estable</span>;
  }
  const up = delta > 0;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-semibold ${up ? "text-emerald-600" : "text-red-500"}`} title="Variación de conformes entre las dos últimas semanas cerradas">
      {up ? "▲" : "▼"} {Math.abs(delta)}
    </span>
  );
}

function EvolucionGlobal({ evolucion }: { evolucion: EvolucionData }) {
  const valores = evolucion.global.conformesPorSemana;
  const labels = evolucion.semanas.map((s) => s.label.replace(/^\d+-/, "")); // "W30"
  const max = Math.max(...valores, 1);
  const total = valores.reduce((a, b) => a + b, 0);
  const { delta, hayDatos } = deltaSemanal(valores);
  return (
    <section className="rounded-lg border border-surface-200 bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-surface-800">Evolución de conformes</h2>
          <p className="text-[11px] text-surface-400">Últimas {valores.length} semanas · {total} conformes en total</p>
        </div>
        {hayDatos && delta !== 0 && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11px] font-semibold ${delta > 0 ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-500"}`}>
            {delta > 0 ? "▲" : "▼"} {Math.abs(delta)} vs semana previa
          </span>
        )}
      </div>
      <div className="flex items-end gap-1.5 sm:gap-2" style={{ height: 96 }}>
        {valores.map((v, i) => {
          const h = Math.max(2, Math.round((v / max) * 84));
          const enCurso = i === valores.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1">
              <span className="text-[10px] font-medium tabular-nums text-surface-500">{v}</span>
              <div
                className={`w-full rounded-t ${enCurso ? "bg-emerald-300" : "bg-emerald-500"}`}
                style={{ height: `${h}px` }}
                title={`${evolucion.semanas[i].label}: ${v} conformes${enCurso ? " (en curso)" : ""}`}
              />
              <span className="text-[9px] text-surface-400">{labels[i]}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "primary" | "success" | "danger" }) {
  const color = tone === "primary" ? "text-primary-600" : tone === "success" ? "text-emerald-600" : tone === "danger" ? "text-red-600" : "text-surface-800";
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-3 sm:p-4">
      <p className="text-[11px] font-medium uppercase tracking-wide text-surface-400">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

function RankingCard({ tecnico, maxConformes, serie }: { tecnico: RankingRow; maxConformes: number; serie?: SerieTecnico }) {
  const progress = maxConformes > 0 ? Math.round((tecnico.conformes / maxConformes) * 100) : 0;
  const positionClass = tecnico.puesto === 1 ? "bg-amber-50 text-amber-700 border-amber-200" : tecnico.puesto === 2 ? "bg-surface-100 text-surface-700 border-surface-200" : tecnico.puesto === 3 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-white text-surface-500 border-surface-200";
  const conformesSerie = serie?.conformesPorSemana || [];
  const tieneSerie = conformesSerie.some((n) => n > 0);

  return (
    <section className="rounded-lg border border-surface-200 bg-white p-3.5 shadow-sm shadow-surface-200/40 transition-colors hover:border-surface-300 sm:p-4">
      <div className="flex items-start gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border text-sm font-semibold tabular-nums ${positionClass}`}>
          #{tecnico.puesto}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-surface-800 sm:text-base">{tecnico.tecnicoNombre}</h2>
            {tecnico.esGanadorViernes && <CrownIcon className="h-5 w-5 shrink-0 text-amber-500" />}
          </div>
          <p className="text-[11px] text-surface-400">{tecnico.equipoKey}</p>
        </div>
        <div className="text-right">
          <p className="text-xl font-semibold text-surface-800 tabular-nums sm:text-2xl">{tecnico.total}</p>
          <p className="text-[10px] uppercase tracking-wide text-surface-400">total</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Metric label="Inst./Auditar" value={tecnico.instaladosAuditar} tone="primary" />
        <Metric label="Conformes" value={tecnico.conformes} tone="success" />
        <Metric label="No conf." value={tecnico.noConformes} tone="danger" />
      </div>

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11px]">
          <span className="text-surface-400">Conformes vs lider</span>
          <span className="font-medium text-surface-700">{progress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-100">
          <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {tieneSerie && (
        <div className="mt-3 flex items-center justify-between gap-2 border-t border-surface-100 pt-2.5">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wide text-surface-400">Tendencia (8 sem.)</p>
            <DeltaBadge values={conformesSerie} />
          </div>
          <Sparkline values={conformesSerie} />
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: "primary" | "success" | "danger" }) {
  const color = tone === "primary" ? "text-primary-600" : tone === "success" ? "text-emerald-600" : "text-red-600";
  return (
    <div className="rounded-md bg-surface-50 px-2 py-2">
      <p className={`text-base font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="mt-0.5 text-[10px] text-surface-400">{label}</p>
    </div>
  );
}
