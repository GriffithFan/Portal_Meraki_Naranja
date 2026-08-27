"use client";
import { memo, useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { IconTrash } from "@/components/ui/Icons";
import { esTipoIncidenciaEspecial } from "@/lib/tipoIncidencia";

/* eslint-disable @typescript-eslint/no-explicit-any */

/** Forma minima de una columna de la tabla (la pantalla define la suya, compatible). */
export type ColumnaTabla = {
  id: string;
  field: string;
  width: number;
  [k: string]: any;
};

/**
 * Handlers de la fila. Viajan dentro de un ref para que su identidad sea estable:
 * asi <FilaTarea> puede estar memoizada sin que cada render del padre invalide el
 * memo, y sin closures viejas (el ref apunta siempre al render actual).
 */
export type AccionesFila = {
  openDetail: (t: any) => void;
  toggleSelect: (id: string) => void;
  handleRowDragStart: (e: React.DragEvent, id: string) => void;
  setConfirmDelete: (v: any) => void;
  tareaDeleteLabel: (t: any) => string;
  renderCell: (t: any, col: any) => React.ReactNode;
  getColWidth: (col: any) => number | undefined;
};

/** Alto de una fila en px. Solo es la estimacion inicial: el virtualizador mide las reales. */
export const ALTO_FILA = 29;

export const FilaTarea = memo(function FilaTarea({
  t, idx, isModOrAdmin, esAdmin, selected, visibleColumns, acciones, medirRef,
}: {
  t: any;
  idx: number;
  isModOrAdmin: boolean;
  esAdmin: boolean;
  selected: boolean;
  visibleColumns: ColumnaTabla[];
  acciones: React.MutableRefObject<AccionesFila>;
  cellVersion: unknown;
  /** Lo usa el virtualizador para medir el alto real de la fila. */
  medirRef?: (el: HTMLTableRowElement | null) => void;
}) {
  const a = acciones.current;
  const especial = esTipoIncidenciaEspecial(t.tipoIncidencia);
  return (
    <tr
      ref={medirRef}
      data-index={idx}
      onClick={() => a.openDetail(t)}
      title={especial ? `Tarea especial — Tipo de incidencia: ${t.tipoIncidencia}` : undefined}
      className={`pmn-fila-tarea cursor-pointer ${
        especial
          ? "bg-amber-100/80 hover:bg-amber-200/80 shadow-[inset_4px_0_0_0_#f59e0b]"
          : `hover:bg-surface-50 ${idx % 2 === 0 ? "" : "bg-surface-50/40"}`
      }`}
    >
      {isModOrAdmin && (
        <td className="w-16 px-1 text-center" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-1">
            <span
              draggable
              onDragStart={(e) => a.handleRowDragStart(e, t.id)}
              className="cursor-grab active:cursor-grabbing text-surface-300 hover:text-surface-500 px-0.5"
              title="Arrastrar a un espacio"
            >
              <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><circle cx="9" cy="5" r="1.5"/><circle cx="15" cy="5" r="1.5"/><circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/><circle cx="9" cy="19" r="1.5"/><circle cx="15" cy="19" r="1.5"/></svg>
            </span>
            <input type="checkbox" checked={selected} onChange={() => a.toggleSelect(t.id)} className="accent-primary-600 cursor-pointer" />
            {esAdmin && (
              <button
                type="button"
                onClick={() => a.setConfirmDelete({ type: "tarea", id: t.id, label: a.tareaDeleteLabel(t) })}
                className="rounded p-0.5 text-red-400 hover:bg-red-50 hover:text-red-600"
                title="Eliminar tarea"
                aria-label="Eliminar tarea"
              >
                <IconTrash className="h-3 w-3" />
              </button>
            )}
          </div>
        </td>
      )}
      {visibleColumns.map((col) => (
        <td
          key={col.id}
          style={{ width: a.getColWidth(col), minWidth: 40, maxWidth: a.getColWidth(col) }}
          className="px-2.5 py-1.5 text-surface-600 overflow-hidden"
        >
          {a.renderCell(t, col)}
        </td>
      ))}
    </tr>
  );
});

/**
 * Cuerpo de la tabla virtualizado: por muchas filas que tenga el grupo, en el DOM
 * solo existen las que entran en pantalla (mas un margen). El alto que falta se
 * rellena con dos filas espaciadoras, para que la barra de scroll siga siendo la real.
 *
 * OJO: en esta pantalla la ventana NO scrollea. El layout de tareas mete el contenido
 * en `<div class="flex-1 overflow-y-auto">` (ver dashboard/tareas/layout.tsx), asi que
 * el scroll pasa ahi adentro. Por eso se busca el ancestro que realmente scrollea en
 * vez de asumir la ventana: apuntando al elemento equivocado el virtualizador no se
 * entera de nada y cada grupo se queda mostrando siempre sus primeras filas.
 */
export function CuerpoTareasVirtual({
  items, visibleColumns, acciones, isModOrAdmin, esAdmin, selectedIds, cellVersion, colSpan, layoutToken,
}: {
  items: any[];
  visibleColumns: ColumnaTabla[];
  acciones: React.MutableRefObject<AccionesFila>;
  isModOrAdmin: boolean;
  esAdmin: boolean;
  selectedIds: Set<string>;
  cellVersion: unknown;
  colSpan: number;
  /** Cambia cuando el layout de arriba se movio (grupos abiertos/cerrados, filas nuevas). */
  layoutToken?: unknown;
}) {
  const contenedorRef = useRef<HTMLTableSectionElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);

  // Distancia del tbody al tope del documento. Se recalcula cuando cambia la cantidad
  // de filas o las columnas, que es cuando el layout de arriba pudo haberse movido.
  useLayoutEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;

    // Ancestro que realmente scrollea EN VERTICAL. No alcanza con mirar `overflow-y`:
    // el envoltorio de la tabla tiene `overflow-x: auto` para el scroll horizontal, y
    // CSS convierte el `overflow-y: visible` de al lado en `auto` — asi que ese div
    // parece scrolleable, el virtualizador se colgaba de el (nunca se mueve) y
    // terminaba dibujando TODAS las filas. Hay que exigir que de verdad desborde.
    let ancestro: HTMLElement | null = el.parentElement;
    while (ancestro) {
      const cs = getComputedStyle(ancestro);
      if (/auto|scroll/.test(cs.overflowY) && ancestro.scrollHeight > ancestro.clientHeight + 1) break;
      ancestro = ancestro.parentElement;
    }
    const cont = ancestro ?? (document.scrollingElement as HTMLElement);
    setScrollEl((prev) => (prev === cont ? prev : cont));

    // Distancia del tbody al tope del CONTENIDO del contenedor (no de la pantalla),
    // que es lo que espera `scrollMargin`. No cambia al scrollear; si cuando se abre
    // o cierra un grupo de arriba, por eso el layoutToken.
    let pendiente = false;
    let frenado: ReturnType<typeof setTimeout> | null = null;
    const medir = () => {
      const y = el.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop;
      // Solo se toca el estado si de verdad se movio: sin esta guarda, medir ->
      // render -> medir seria un bucle.
      setOffset((prev) => (Math.abs(prev - y) < 1 ? prev : y));
    };
    // `getBoundingClientRect` fuerza layout, y hay un medidor por grupo: se agrupan
    // en un frame para no encadenar una medicion por grupo y por cambio.
    const medirDiferido = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; medir(); });
    };
    medir();
    // Observar el CONTENEDOR no alcanza: su caja no cambia nunca, lo que cambia es su
    // contenido. Cuando un grupo de mas arriba crece o se achica —al medir sus filas
    // reales— este tbody se corre y el offset queda viejo. El sintoma medido: con la
    // lista arriba de todo, el primer grupo tenia 2.244 px de relleno donde correspondia
    // cero, y al scrollear los grupos se quedaban mostrando siempre las mismas filas.
    // Medir es CARO: `getBoundingClientRect` fuerza un layout, y hay un medidor por grupo.
    // Hacerlo en cada cuadro de scroll costaba el 11% del tiempo de CPU y dejaba el scroll
    // en 6 fps. Pero tampoco se puede no medir: cuando un grupo de mas arriba cambia de
    // alto, este se corre y su offset queda viejo.
    //
    // La salida es medir cuando el scroll SE DETIENE. Mientras el dedo se mueve el offset
    // no cambia —lo que cambia es la posicion del scroll, que el virtualizador ya sigue
    // solo— asi que no hace falta remedir hasta que la pagina se acomode.
    const alFrenar = () => {
      if (frenado) clearTimeout(frenado);
      frenado = setTimeout(medir, 150);
    };
    const ro = new ResizeObserver(medirDiferido);
    ro.observe(cont);
    const contenido = cont.firstElementChild;
    if (contenido) ro.observe(contenido);
    cont.addEventListener("scroll", alFrenar, { passive: true });
    return () => {
      ro.disconnect();
      if (frenado) clearTimeout(frenado);
      cont.removeEventListener("scroll", alFrenar);
    };
  }, [items.length, visibleColumns, layoutToken]);

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollEl,
    estimateSize: () => ALTO_FILA,
    // 3 y no 10: hay un virtualizador POR GRUPO, asi que el overscan se paga 13 veces.
    // Con 10 eran 130 filas de sobra en el DOM, y el costo de tenerlas ahi no es dibujarlas
    // sino que el navegador recalcule su estilo en cada cambio.
    overscan: 3,
    scrollMargin: offset,
  });

  const filas = virtualizer.getVirtualItems();
  const alturaTotal = virtualizer.getTotalSize();
  // OJO: con `scrollMargin`, el `start`/`end` de cada fila viene desplazado por ese
  // margen, pero `getTotalSize()` NO. Hay que restarselo a los dos extremos o el
  // relleno de abajo sale negativo en todos los grupos menos el primero — y sin ese
  // relleno el grupo colapsa al alto de las filas visibles (medido: INSTALADO con 81
  // filas ocupaba 364 px en vez de ~2670).
  const margen = virtualizer.options.scrollMargin;
  const rellenoArriba = filas.length > 0 ? filas[0].start - margen : 0;
  const rellenoAbajo = filas.length > 0 ? alturaTotal - (filas[filas.length - 1].end - margen) : 0;

  return (
    <tbody
      ref={contenedorRef}
      // `content-visibility: auto` le dice al navegador que NO calcule estilo ni layout de
      // este grupo mientras este fuera de la pantalla. Es lo que ataca el costo real
      // medido: recalcular estilo era el 32,7% del tiempo de scroll sobre un arbol de
      // 50.088 nodos. `contain-intrinsic-size` le da el alto que debe reservar, para que
      // la barra de scroll no salte al entrar y salir de la vista.
      style={{ contentVisibility: "auto", containIntrinsicSize: `auto ${Math.max(alturaTotal, 1)}px` }}
    >
      {/* Grupo entero fuera de la ventana visible: no se dibuja ninguna fila, pero el
          cuerpo tiene que seguir ocupando su alto o el resto de la pagina se corre. */}
      {filas.length === 0 && alturaTotal > 0 && (
        <tr style={{ height: alturaTotal }}><td colSpan={colSpan} /></tr>
      )}
      {rellenoArriba > 0 && <tr style={{ height: rellenoArriba }}><td colSpan={colSpan} /></tr>}
      {filas.map((fila) => {
        const t = items[fila.index];
        if (!t) return null;
        return (
          <FilaTarea
            key={t.id}
            t={t}
            idx={fila.index}
            isModOrAdmin={isModOrAdmin}
            esAdmin={esAdmin}
            selected={selectedIds.has(t.id)}
            visibleColumns={visibleColumns}
            acciones={acciones}
            cellVersion={cellVersion}
            medirRef={virtualizer.measureElement}
          />
        );
      })}
      {rellenoAbajo > 0 && <tr style={{ height: rellenoAbajo }}><td colSpan={colSpan} /></tr>}
    </tbody>
  );
}
