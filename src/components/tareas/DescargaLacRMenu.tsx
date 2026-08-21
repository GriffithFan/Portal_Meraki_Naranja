"use client";
import { useEffect, useRef, useState } from "react";
import { IconDownload, IconX } from "@/components/ui/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Opcion = { valor: string; etiqueta: string; total: number };
type Opciones = {
  totalPredios: number;
  tecnicos: { id: string; nombre: string; total: number }[];
  provincias: Opcion[];
  ciudades: Opcion[];
  carpetas: { id: string; nombre: string; total: number }[];
};

/** Las 5 listas que arma el export. Por defecto se bajan todas, como venia siendo. */
const LISTAS = [
  { tipo: "nc", label: "NC", ayuda: "No conformes" },
  { tipo: "cronogramas", label: "Cronogramas", ayuda: "Resto de estados" },
  { tipo: "ocp", label: "OCP", ayuda: "Carpeta OCP" },
  { tipo: "asignados-sin-cronograma", label: "Asignados sin cronograma", ayuda: "SIN ASIGNAR con tecnico y sin fechas" },
  { tipo: "asignados-vencidos", label: "Asignados vencidos", ayuda: "SIN ASIGNAR con tecnico y con fechas" },
];

type ItemGrupo = { clave: string; etiqueta: string; total: number };

/** Un bloque de chips: tocar una la marca para omitirla de la descarga. */
function GrupoOmitir({
  titulo, items, seleccion, onToggle,
}: {
  titulo: string;
  items: ItemGrupo[];
  seleccion: string[];
  onToggle: (valor: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">{titulo}</span>
        {seleccion.length > 0 && (
          <span className="text-[10px] text-red-500">
            {seleccion.length} omitido{seleccion.length > 1 ? "s" : ""}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1 max-h-28 overflow-y-auto">
        {items.map((item) => {
          const omitido = seleccion.includes(item.clave);
          return (
            <button
              key={item.clave}
              type="button"
              onClick={() => onToggle(item.clave)}
              title={omitido ? "Se va a omitir — clic para volver a incluirlo" : "Clic para omitirlo de la descarga"}
              className={`px-1.5 py-0.5 rounded border text-[10px] transition-colors ${
                omitido
                  ? "border-red-200 bg-red-50 text-red-600 line-through"
                  : "border-surface-200 bg-white text-surface-600 hover:bg-surface-50"
              }`}
            >
              {item.etiqueta} <span className="text-surface-400">{item.total}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Boton de descarga LAC-R NO con su panel de opciones.
 *
 * Por defecto baja las 5 listas con el criterio ESTRICTO (solo LAC-R = NO), que es
 * lo correcto: un predio en LAC-R SI no hay que relanzarlo aunque su cronograma este
 * vencido o venza pronto. Desde el panel se puede acotar mas todavia sacando
 * tecnicos, carpetas, provincias o departamentos puntuales antes de bajar.
 */
export default function DescargaLacRMenu({
  espacioId,
  includeSubspaces,
}: {
  espacioId: string;
  includeSubspaces: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  const [opciones, setOpciones] = useState<Opciones | null>(null);
  const [cargando, setCargando] = useState(false);
  const [listas, setListas] = useState<string[]>(LISTAS.map((l) => l.tipo));
  const [incluirLacRSi, setIncluirLacRSi] = useState(false);
  const [incluirFuturos, setIncluirFuturos] = useState(false);
  const [omTecnicos, setOmTecnicos] = useState<string[]>([]);
  const [omProvincias, setOmProvincias] = useState<string[]>([]);
  const [omCiudades, setOmCiudades] = useState<string[]>([]);
  const [omCarpetas, setOmCarpetas] = useState<string[]>([]);
  const panelRef = useRef<HTMLDivElement>(null);

  // Las opciones se piden recien al abrir el panel: no tiene sentido consultarlas en
  // cada carga de la pantalla si el desplegable casi nunca se usa.
  useEffect(() => {
    if (!abierto || opciones || cargando) return;
    setCargando(true);
    const params = new URLSearchParams({ espacioId });
    if (includeSubspaces) params.set("includeSubspaces", "true");
    fetch(`/api/tareas/exports/no-conformes-lacr-no/opciones?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => data && setOpciones(data))
      .catch(() => {})
      .finally(() => setCargando(false));
  }, [abierto, opciones, cargando, espacioId, includeSubspaces]);

  useEffect(() => {
    if (!abierto) return;
    const clicFuera = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setAbierto(false);
    };
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAbierto(false);
    };
    document.addEventListener("mousedown", clicFuera);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("mousedown", clicFuera);
      document.removeEventListener("keydown", escape);
    };
  }, [abierto]);

  const alternar = (lista: string[], set: (v: string[]) => void, valor: string) =>
    set(lista.includes(valor) ? lista.filter((x) => x !== valor) : [...lista, valor]);

  const descargar = () => {
    if (listas.length === 0) return;
    // Un <a> por lista, espaciados: la primera vez el navegador puede pedir permiso
    // para "descargar varios archivos".
    listas.forEach((tipo, i) => {
      const params = new URLSearchParams({ espacioId, tipo });
      if (includeSubspaces) params.set("includeSubspaces", "true");
      if (incluirLacRSi) params.set("lacr", "todos");
      if (incluirFuturos) params.set("incluirFuturos", "1");
      if (omTecnicos.length) params.set("omitirTecnicos", omTecnicos.join(","));
      if (omProvincias.length) params.set("omitirProvincias", omProvincias.join(","));
      if (omCiudades.length) params.set("omitirCiudades", omCiudades.join(","));
      if (omCarpetas.length) params.set("omitirEspacios", omCarpetas.join(","));
      window.setTimeout(() => {
        const anchor = document.createElement("a");
        anchor.href = `/api/tareas/exports/no-conformes-lacr-no?${params.toString()}`;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      }, i * 600);
    });
    setAbierto(false);
  };

  const omitidos = omTecnicos.length + omProvincias.length + omCiudades.length + omCarpetas.length;

  return (
    <div className="relative" ref={panelRef}>
      <div className="flex">
        <button
          onClick={descargar}
          className="px-2.5 py-1.5 border border-red-200 bg-red-50 text-red-700 rounded-l-md text-xs font-medium hover:bg-red-100 transition-colors flex items-center gap-1"
          title="Descargar las listas LAC-R NO. Por defecto solo entran los LAC-R = NO."
        >
          <IconDownload className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">LAC-R NO</span>
          {omitidos > 0 && <span className="text-[10px] bg-red-200 text-red-800 rounded px-1">-{omitidos}</span>}
        </button>
        <button
          onClick={() => setAbierto((v) => !v)}
          aria-label="Opciones de descarga"
          title="Opciones de descarga"
          className="px-1.5 py-1.5 border border-l-0 border-red-200 bg-red-50 text-red-700 rounded-r-md hover:bg-red-100 transition-colors"
        >
          <svg
            className={`w-3 h-3 transition-transform ${abierto ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      </div>

      {abierto && (
        <div className="absolute right-0 z-50 mt-1 w-[22rem] max-w-[calc(100vw-2rem)] rounded-lg border border-surface-200 bg-white p-3 shadow-lg space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-surface-700">Opciones de descarga</span>
            <button onClick={() => setAbierto(false)} className="text-surface-300 hover:text-surface-500" aria-label="Cerrar">
              <IconX className="w-3.5 h-3.5" />
            </button>
          </div>

          <div>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-surface-400">Listas</span>
            <div className="mt-1 space-y-1">
              {LISTAS.map((lista) => (
                <label key={lista.tipo} className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={listas.includes(lista.tipo)}
                    onChange={() => alternar(listas, setListas, lista.tipo)}
                    className="mt-0.5 accent-red-600"
                  />
                  <span className="text-[11px] text-surface-700 leading-tight">
                    {lista.label}
                    <span className="block text-[10px] text-surface-400">{lista.ayuda}</span>
                  </span>
                </label>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2 cursor-pointer rounded-md bg-surface-50 p-2">
            <input
              type="checkbox"
              checked={incluirLacRSi}
              onChange={(e) => setIncluirLacRSi(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span className="text-[11px] text-surface-700 leading-tight">
              Incluir tambien los LAC-R SI
              <span className="block text-[10px] text-surface-400">
                Por defecto no entran: un predio en LAC-R SI no se relanza aunque el cronograma este vencido.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-2 cursor-pointer rounded-md bg-surface-50 p-2">
            <input
              type="checkbox"
              checked={incluirFuturos}
              onChange={(e) => setIncluirFuturos(e.target.checked)}
              className="mt-0.5 accent-red-600"
            />
            <span className="text-[11px] text-surface-700 leading-tight">
              Incluir los que aun no abrieron (PRONTO)
              <span className="block text-[10px] text-surface-400">
                Por defecto no entran: ya tienen ventana por delante y volver a pedirlos la corre 14 dias mas.
              </span>
            </span>
          </label>

          {cargando && <div className="text-[11px] text-surface-400">Cargando opciones…</div>}

          {opciones && (
            <div className="space-y-2.5 border-t border-surface-100 pt-2.5">
              <div className="text-[10px] text-surface-400">
                Toca una opcion para omitirla. {opciones.totalPredios} predios en este espacio.
              </div>
              <GrupoOmitir
                titulo="Omitir tecnicos"
                items={opciones.tecnicos.map((t) => ({ clave: t.id, etiqueta: t.nombre, total: t.total }))}
                seleccion={omTecnicos}
                onToggle={(v) => alternar(omTecnicos, setOmTecnicos, v)}
              />
              <GrupoOmitir
                titulo="Omitir carpetas"
                items={opciones.carpetas.map((c) => ({ clave: c.id, etiqueta: c.nombre, total: c.total }))}
                seleccion={omCarpetas}
                onToggle={(v) => alternar(omCarpetas, setOmCarpetas, v)}
              />
              <GrupoOmitir
                titulo="Omitir provincias"
                items={opciones.provincias.map((p) => ({ clave: p.valor, etiqueta: p.etiqueta, total: p.total }))}
                seleccion={omProvincias}
                onToggle={(v) => alternar(omProvincias, setOmProvincias, v)}
              />
              <GrupoOmitir
                titulo="Omitir departamentos"
                items={opciones.ciudades.map((c) => ({ clave: c.valor, etiqueta: c.etiqueta, total: c.total }))}
                seleccion={omCiudades}
                onToggle={(v) => alternar(omCiudades, setOmCiudades, v)}
              />
            </div>
          )}

          <div className="flex items-center justify-between border-t border-surface-100 pt-2">
            <button
              onClick={() => {
                setListas(LISTAS.map((l) => l.tipo));
                setIncluirLacRSi(false);
                setOmTecnicos([]);
                setOmProvincias([]);
                setOmCiudades([]);
                setOmCarpetas([]);
              }}
              className="text-[11px] text-surface-500 hover:text-surface-700"
            >
              Restablecer
            </button>
            <button
              onClick={descargar}
              disabled={listas.length === 0}
              className="px-3 py-1.5 rounded-md bg-red-600 text-white text-xs font-medium hover:bg-red-700 disabled:opacity-40 transition-colors"
            >
              Descargar {listas.length} {listas.length === 1 ? "lista" : "listas"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
