"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useSession } from "@/hooks/useSession";
import { cercania, colorPorEdad, distanciaLegible, edadLegible, type TecnicoUbicado } from "@/components/mapa/ubicacionUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

const MapaTecnicos = dynamic(() => import("@/components/mapa/MapaTecnicos"), { ssr: false });

const REFRESCO_MS = 60_000;

interface Tecnico extends TecnicoUbicado {
  telefono: string | null;
  consentimiento: "aceptado" | "revocado" | "pendiente";
  ultimoInstalado: {
    codigo: string | null; nombre: string | null; incidencia: string | null;
    direccion: string | null; ciudad: string | null; provincia: string | null;
    estadoActual: string | null; fecha: string; distanciaM: number | null;
  } | null;
}

interface Respuesta {
  generadoEn: string; ventana: string; enHorario: boolean; horaArt: string; tecnicos: Tecnico[];
}

const fechaAR = (iso: string) =>
  new Date(iso).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });


export default function MapaTecnicosPage() {
  const { session, loading: cargandoSesion } = useSession();
  const esAdmin = session?.rol === "ADMIN";

  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const res = await fetch("/api/ubicacion/tecnicos", { credentials: "include", cache: "no-store" });
      if (res.ok) setDatos(await res.json());
    } catch { /* se reintenta en el próximo refresco */ }
    finally { setCargando(false); }
  }, []);

  useEffect(() => {
    if (!esAdmin) return;
    cargar();
    const t = setInterval(cargar, REFRESCO_MS);
    return () => clearInterval(t);
  }, [esAdmin, cargar]);

  const tecnicos = useMemo(() => datos?.tecnicos ?? [], [datos]);
  const conSenal = useMemo(() => tecnicos.filter((t) => t.ubicacion), [tecnicos]);
  const recientes = useMemo(() => conSenal.filter((t) => (t.ubicacion?.minutos ?? 9999) <= 60), [conSenal]);
  const sinConsentimiento = useMemo(() => tecnicos.filter((t) => t.consentimiento !== "aceptado"), [tecnicos]);
  const elegido = useMemo(() => tecnicos.find((t) => t.id === seleccionado) ?? null, [tecnicos, seleccionado]);

  if (cargandoSesion) return <div className="p-6 text-sm text-surface-400">Cargando…</div>;
  if (!esAdmin) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-surface-200 bg-white p-5 text-sm text-surface-600">
          Esta sección es solo para administradores.
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-900">Mapa de técnicos</h1>
          <p className="mt-0.5 text-sm text-surface-500">
            Última ubicación conocida de los técnicos activos. Se registra {datos?.ventana ?? "en horario laboral"}.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-surface-500">
          {datos && !datos.enHorario && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
              Fuera de horario · {datos.horaArt}
            </span>
          )}
          <button onClick={cargar} className="rounded-lg border border-surface-300 px-3 py-1.5 font-medium hover:bg-surface-50">
            Actualizar
          </button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-surface-200 bg-surface-200 sm:grid-cols-4">
        {[
          ["Técnicos activos", tecnicos.length],
          ["Con señal", conSenal.length],
          ["Señal de la última hora", recientes.length],
          ["Sin consentimiento", sinConsentimiento.length],
        ].map(([label, valor]) => (
          <div key={label as string} className="bg-white px-3 py-2.5">
            <div className="text-lg font-semibold tabular-nums text-surface-900">{valor as number}</div>
            <div className="text-[11px] uppercase tracking-wide text-surface-400">{label as string}</div>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50 px-3.5 py-2.5 text-[12.5px] text-blue-800">
        La posición se registra <b>solo mientras el técnico tiene Carrot abierto</b>: un navegador no puede
        reportar en segundo plano. Mirá siempre la antigüedad de la señal antes de decidir algo.
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="h-[420px] overflow-hidden rounded-lg border border-surface-200 bg-white lg:h-[620px]">
          {cargando ? (
            <div className="flex h-full items-center justify-center text-sm text-surface-400">Cargando mapa…</div>
          ) : conSenal.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center">
              <p className="text-sm font-medium text-surface-600">Todavía no hay ninguna señal</p>
              <p className="max-w-sm text-xs text-surface-400">
                Aparecen acá cuando los técnicos acepten compartir ubicación y abran Carrot dentro del horario.
              </p>
            </div>
          ) : (
            <MapaTecnicos tecnicos={conSenal} seleccionado={seleccionado} onSeleccionar={setSeleccionado} />
          )}
        </div>

        <aside className="flex flex-col gap-3">
          {elegido && (
            <div className="rounded-lg border border-surface-200 bg-white p-4">
              <div className="flex items-start gap-3">
                {elegido.fotoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={elegido.fotoUrl} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-surface-700 text-base font-semibold text-white">
                    {elegido.nombre.slice(0, 2).toUpperCase()}
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-semibold text-surface-900">{elegido.nombre}</div>
                  <div className="text-xs text-surface-500">
                    {elegido.th ? `TH${String(elegido.th).padStart(2, "0")}` : "Sin TH"}
                    {elegido.telefono ? ` · ${elegido.telefono}` : ""}
                  </div>
                  {elegido.ubicacion && (
                    <div className="mt-1.5 flex items-center gap-1.5 text-xs">
                      <span className="h-2 w-2 rounded-full" style={{ background: colorPorEdad(elegido.ubicacion.minutos) }} />
                      <span className="font-medium text-surface-700">Señal {edadLegible(elegido.ubicacion.minutos)}</span>
                      <span className="text-surface-400">
                        · {elegido.ubicacion.origen}
                        {elegido.ubicacion.precision ? ` ±${Math.round(elegido.ubicacion.precision)} m` : ""}
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lo primero que se quiere saber: ¿está en lo que tiene asignado o no?
                  Antes había que mirar el mapa y estimar a ojo. */}
              {elegido.asignados && elegido.asignados.length > 0 && (() => {
                const cerca = elegido.asignados[0];
                const c = cercania(cerca.distanciaM);
                return (
                  <div className="mt-3.5 border-t border-surface-100 pt-3">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-surface-400">
                      Pendiente más cercano
                    </div>
                    <div className="mt-1.5 flex items-baseline gap-2">
                      <span className="text-lg font-semibold tabular-nums" style={{ color: c.color }}>
                        {distanciaLegible(cerca.distanciaM)}
                      </span>
                      <span className="text-xs font-medium" style={{ color: c.color }}>{c.texto}</span>
                    </div>
                    <div className="mt-0.5 text-sm text-surface-700">
                      <span className="font-semibold">{cerca.codigo}</span>
                      {cerca.ciudad && <span className="text-surface-400"> · {cerca.ciudad}</span>}
                    </div>
                    <div className="text-[11px] text-surface-400">
                      {elegido.asignados.length} pendiente{elegido.asignados.length !== 1 ? "s" : ""} con ubicación
                      {elegido.recorrido && elegido.recorrido.length > 1
                        ? ` · ${elegido.recorrido.length} marcas hoy`
                        : ""}
                    </div>
                  </div>
                );
              })()}

              <div className="mt-3.5 border-t border-surface-100 pt-3">
                <div className="text-[11px] font-medium uppercase tracking-wide text-surface-400">
                  Último predio pasado a instalado
                </div>
                {elegido.ultimoInstalado ? (
                  <div className="mt-1.5 space-y-1">
                    <div className="text-sm font-semibold text-surface-900">
                      {elegido.ultimoInstalado.codigo}
                      {elegido.ultimoInstalado.estadoActual && (
                        <span className="ml-2 rounded-full border border-surface-200 bg-surface-50 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-surface-500">
                          hoy: {elegido.ultimoInstalado.estadoActual}
                        </span>
                      )}
                    </div>
                    {elegido.ultimoInstalado.incidencia && (
                      <div className="font-mono text-[11px] text-surface-400">{elegido.ultimoInstalado.incidencia}</div>
                    )}
                    {elegido.ultimoInstalado.direccion && (
                      <div className="text-xs text-surface-600">{elegido.ultimoInstalado.direccion}</div>
                    )}
                    <div className="text-xs text-surface-500">
                      {fechaAR(elegido.ultimoInstalado.fecha)}
                      {elegido.ultimoInstalado.distanciaM != null && (
                        <> · a <b>{distanciaLegible(elegido.ultimoInstalado.distanciaM)}</b> de donde está ahora</>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="mt-1.5 text-xs text-surface-400">Todavía no pasó ningún predio a INSTALADO.</p>
                )}
              </div>
            </div>
          )}

          <div className="overflow-hidden rounded-lg border border-surface-200 bg-white">
            <div className="border-b border-surface-100 px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-surface-400">
              Técnicos activos
            </div>
            <ul className="max-h-[420px] divide-y divide-surface-50 overflow-y-auto">
              {tecnicos.map((t) => {
                const min = t.ubicacion?.minutos;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => setSeleccionado(seleccionado === t.id ? null : t.id)}
                      disabled={!t.ubicacion}
                      className={`flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors
                        ${seleccionado === t.id ? "bg-surface-50" : "hover:bg-surface-50"}
                        ${!t.ubicacion ? "cursor-default opacity-60" : ""}`}
                    >
                      {t.fotoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.fotoUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-200 text-[11px] font-semibold text-surface-600">
                          {t.nombre.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[13px] font-medium text-surface-800">{t.nombre}</div>
                        <div className="text-[11px] text-surface-400">
                          {t.consentimiento === "pendiente" ? "No aceptó compartir ubicación"
                            : t.consentimiento === "revocado" ? "Revocó el permiso"
                            : min != null ? edadLegible(min) : "Sin señal todavía"}
                        </div>
                      </div>
                      {min != null && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: colorPorEdad(min) }} />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
