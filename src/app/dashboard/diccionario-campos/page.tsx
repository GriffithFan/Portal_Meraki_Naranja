"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tab = "personalizados" | "base";

function formatDate(value?: string) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

export default function DiccionarioCamposPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Tab>("personalizados");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/diccionario-campos", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Sin permisos" : "No se pudo cargar el diccionario");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar el diccionario");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fields = useMemo(() => {
    const source = tab === "personalizados" ? data?.customFields || [] : data?.coreFields || [];
    const needle = query.trim().toLowerCase();
    if (!needle) return source;
    return source.filter((field: any) => [field.nombre, field.clave, field.tipo, field.origen, field.grupo]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(needle)));
  }, [data, query, tab]);

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-72 rounded bg-surface-200 animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, index) => <div key={index} className="h-24 rounded-lg border border-surface-200 bg-white animate-pulse" />)}
        </div>
        <div className="h-96 rounded-lg border border-surface-200 bg-white animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-center">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={fetchData} className="mt-3 rounded-md border border-surface-200 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50">Reintentar</button>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Diccionario de campos</h1>
          <p className="text-xs text-surface-400">Columnas base y campos personalizados detectados en tareas</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar campo"
            className="w-full rounded-md border border-surface-200 bg-white px-3 py-1.5 text-sm text-surface-700 outline-none focus:border-primary-400 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-100 sm:w-64"
          />
          <button onClick={fetchData} className="rounded-md border border-surface-200 px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-50 dark:border-surface-700 dark:text-surface-300 dark:hover:bg-surface-800">Actualizar</button>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat label="Campos base" value={data.resumen.totalCamposBase} />
        <Stat label="Personalizados" value={data.resumen.totalPersonalizados} />
        <Stat label="Activos" value={data.resumen.activos} tone="ok" />
        <Stat label="Con uso" value={data.resumen.conUso} tone={data.resumen.conUso ? "warn" : "default"} />
      </div>

      <div className="rounded-lg border border-surface-200 bg-white dark:border-surface-700 dark:bg-surface-800">
        <div className="flex flex-col gap-3 border-b border-surface-100 p-3 dark:border-surface-700 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-fit rounded-lg bg-surface-100 p-1 dark:bg-surface-900">
            <TabButton active={tab === "personalizados"} onClick={() => setTab("personalizados")}>Personalizados</TabButton>
            <TabButton active={tab === "base"} onClick={() => setTab("base")}>Base</TabButton>
          </div>
          <p className="text-[11px] text-surface-400">Ultima lectura: {new Date(data.generatedAt).toLocaleString("es-AR")}</p>
        </div>

        <div className="divide-y divide-surface-100 p-3 dark:divide-surface-700 sm:hidden">
          {fields.length === 0 ? (
            <div className="p-6 text-center text-sm text-surface-400">Sin campos para mostrar</div>
          ) : fields.map((field: any) => (
            <div key={`${tab}-mobile-${field.clave}`} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-surface-800 dark:text-surface-100">{field.nombre}</p>
                  <code className="mt-1 inline-block max-w-full truncate rounded bg-surface-100 px-1.5 py-0.5 text-[11px] text-surface-700 dark:bg-surface-900 dark:text-surface-200">{field.clave}</code>
                </div>
                {tab === "personalizados" && <span className={clsx("shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", field.activo ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400")}>{field.activo ? "activo" : "inactivo"}</span>}
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-surface-500 dark:text-surface-300">
                <span><b className="font-medium text-surface-400">Tipo:</b> {field.tipo}</span>
                <span><b className="font-medium text-surface-400">Origen:</b> {field.origen}</span>
                {tab === "personalizados" && <span><b className="font-medium text-surface-400">Uso:</b> {field.used} / {data.totalPredios}</span>}
                {field.createdAt && <span><b className="font-medium text-surface-400">Alta:</b> {formatDate(field.createdAt)}</span>}
              </div>
              {tab === "personalizados" && (field.topValues || []).length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {(field.topValues || []).slice(0, 4).map((item: any) => (
                    <span key={`${field.clave}-mobile-${item.valor}`} className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600 dark:bg-surface-700 dark:text-surface-200">{item.valor} · {item.count}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="hidden overflow-x-auto sm:block">
          <table className="min-w-full divide-y divide-surface-100 text-sm dark:divide-surface-700">
            <thead className="bg-surface-50 dark:bg-surface-900/40">
              <tr>
                <Th>Campo</Th>
                <Th>Clave</Th>
                <Th>Tipo</Th>
                <Th>Origen</Th>
                {tab === "personalizados" && <Th>Uso</Th>}
                {tab === "personalizados" && <Th>Valores frecuentes</Th>}
                {tab === "personalizados" && <Th>Estado</Th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100 dark:divide-surface-700">
              {fields.length === 0 ? (
                <tr><td colSpan={tab === "personalizados" ? 7 : 4} className="p-8 text-center text-sm text-surface-400">Sin campos para mostrar</td></tr>
              ) : fields.map((field: any) => (
                <tr key={`${tab}-${field.clave}`} className="hover:bg-surface-50 dark:hover:bg-surface-700/40">
                  <td className="px-3 py-3">
                    <p className="font-medium text-surface-800 dark:text-surface-100">{field.nombre}</p>
                    <p className="text-[11px] text-surface-400">{field.grupo}{field.ancho ? ` · ${field.ancho}px` : ""}{field.createdAt ? ` · ${formatDate(field.createdAt)}` : ""}</p>
                  </td>
                  <td className="px-3 py-3"><code className="rounded bg-surface-100 px-1.5 py-0.5 text-xs text-surface-700 dark:bg-surface-900 dark:text-surface-200">{field.clave}</code></td>
                  <td className="px-3 py-3 text-xs text-surface-600 dark:text-surface-300">{field.tipo}</td>
                  <td className="px-3 py-3 text-xs text-surface-600 dark:text-surface-300">{field.origen}</td>
                  {tab === "personalizados" && <td className="px-3 py-3 text-xs text-surface-600 dark:text-surface-300"><span className="font-semibold tabular-nums text-surface-900 dark:text-surface-100">{field.used}</span> / {data.totalPredios} <span className="text-surface-400">({field.coverage}%)</span></td>}
                  {tab === "personalizados" && (
                    <td className="min-w-[260px] px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(field.topValues || []).length === 0 ? <span className="text-xs text-surface-400">-</span> : field.topValues.map((item: any) => (
                          <span key={`${field.clave}-${item.valor}`} className="rounded-full bg-surface-100 px-2 py-0.5 text-[11px] text-surface-600 dark:bg-surface-700 dark:text-surface-200">{item.valor} · {item.count}</span>
                        ))}
                      </div>
                    </td>
                  )}
                  {tab === "personalizados" && <td className="px-3 py-3"><span className={clsx("rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase", field.activo ? "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-300" : "border-surface-200 bg-surface-50 text-surface-500 dark:border-surface-700 dark:bg-surface-900 dark:text-surface-400")}>{field.activo ? "activo" : "inactivo"}</span></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "default" }: { label: string; value: string | number; tone?: "default" | "ok" | "warn" }) {
  const toneClass = tone === "ok" ? "text-emerald-600" : tone === "warn" ? "text-amber-600" : "text-surface-800 dark:text-surface-100";
  return (
    <div className="rounded-lg border border-surface-200 bg-white p-4 dark:border-surface-700 dark:bg-surface-800">
      <p className="text-xs text-surface-400">{label}</p>
      <p className={clsx("mt-1 text-2xl font-semibold tabular-nums", toneClass)}>{value}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} className={clsx("rounded-md px-3 py-1.5 text-xs font-medium transition", active ? "bg-white text-primary-700 shadow-sm dark:bg-surface-800 dark:text-primary-300" : "text-surface-500 hover:text-surface-800 dark:text-surface-400 dark:hover:text-surface-100")}>{children}</button>;
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wider text-surface-400">{children}</th>;
}
