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
  semana: string;
  desde: string;
  hasta: string;
  isFriday: boolean;
  resumen: { instaladosAuditar: number; conformes: number; noConformes: number; total: number };
  ranking: RankingRow[];
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
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/ranking-tecnicos", { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error(res.status === 401 ? "No autenticado" : "No se pudo cargar el ranking");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el ranking");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = window.setInterval(() => fetchData(true), 60000);
    return () => window.clearInterval(interval);
  }, [fetchData]);

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
            {data.isFriday && topConformes > 0 && <CrownIcon className="h-5 w-5 text-amber-500" />}
          </div>
          <p className="mt-0.5 text-xs text-surface-400">Semana {data.semana} · {dateRange}</p>
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

      {data.ranking.length === 0 ? (
        <section className="rounded-lg border border-surface-200 bg-white p-8 text-center">
          <p className="text-sm font-medium text-surface-700">Sin actividad semanal</p>
          <p className="mt-1 text-xs text-surface-400">El ranking aparece cuando haya movimientos de esta semana.</p>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.ranking.map((tecnico) => (
            <RankingCard key={tecnico.tecnicoId} tecnico={tecnico} maxConformes={topConformes} />
          ))}
        </div>
      )}
    </div>
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

function RankingCard({ tecnico, maxConformes }: { tecnico: RankingRow; maxConformes: number }) {
  const progress = maxConformes > 0 ? Math.round((tecnico.conformes / maxConformes) * 100) : 0;
  const positionClass = tecnico.puesto === 1 ? "bg-amber-50 text-amber-700 border-amber-200" : tecnico.puesto === 2 ? "bg-surface-100 text-surface-700 border-surface-200" : tecnico.puesto === 3 ? "bg-orange-50 text-orange-700 border-orange-200" : "bg-white text-surface-500 border-surface-200";

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