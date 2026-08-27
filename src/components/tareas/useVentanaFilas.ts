"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";

/**
 * Virtualiza el cuerpo de una tabla: por muchas filas que haya, en el DOM solo existen
 * las que entran en pantalla más un margen. El alto que falta se rellena con dos filas
 * espaciadoras, para que la barra de scroll siga siendo la real.
 *
 * Vive en un hook aparte porque hay DOS tablas de tareas con marcado distinto —la lista
 * general y la de cada carpeta— y las tres trampas de abajo costaron encontrarlas. Que
 * cada una tenga su propia copia de esto es la forma de que una se arregle y la otra no.
 *
 * TRAMPA 1 — el elemento que scrollea. En estas pantallas la ventana NO scrollea: el
 * layout mete el contenido en un `<div class="flex-1 overflow-y-auto">`. Apuntando al
 * elemento equivocado, el virtualizador no se entera de nada y la tabla se queda siempre
 * mostrando sus primeras filas.
 *
 * TRAMPA 2 — no alcanza con mirar `overflow-y`. El envoltorio de la tabla tiene
 * `overflow-x: auto` para el scroll horizontal, y CSS convierte el `overflow-y: visible`
 * de al lado en `auto`: ese div PARECE scrolleable pero nunca se mueve. Hay que exigir
 * además que de verdad desborde.
 *
 * TRAMPA 3 — `scrollMargin` desplaza el `start`/`end` de cada fila, pero NO
 * `getTotalSize()`. Hay que restárselo a los dos extremos o el relleno de abajo sale
 * negativo y la tabla colapsa al alto de las filas visibles.
 */
export function useVentanaFilas({
  count,
  altoEstimado,
  deps = [],
}: {
  count: number;
  /** Alto típico de una fila en px. Solo es la estimación inicial. */
  altoEstimado: number;
  /** Cambia cuando el layout de arriba pudo haberse movido (filtros, columnas, grupos). */
  deps?: unknown[];
}) {
  const contenedorRef = useRef<HTMLTableSectionElement>(null);
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const [offset, setOffset] = useState(0);

  useLayoutEffect(() => {
    const el = contenedorRef.current;
    if (!el) return;

    let ancestro: HTMLElement | null = el.parentElement;
    while (ancestro) {
      const cs = getComputedStyle(ancestro);
      if (/auto|scroll/.test(cs.overflowY) && ancestro.scrollHeight > ancestro.clientHeight + 1) break;
      ancestro = ancestro.parentElement;
    }
    const cont = ancestro ?? (document.scrollingElement as HTMLElement);
    setScrollEl((prev) => (prev === cont ? prev : cont));

    let pendiente = false;
    const medir = () => {
      const y = el.getBoundingClientRect().top - cont.getBoundingClientRect().top + cont.scrollTop;
      // Solo se toca el estado si de verdad se movió: sin esta guarda,
      // medir -> render -> medir sería un bucle.
      setOffset((prev) => (Math.abs(prev - y) < 1 ? prev : y));
    };
    const medirDiferido = () => {
      if (pendiente) return;
      pendiente = true;
      requestAnimationFrame(() => { pendiente = false; medir(); });
    };
    medir();
    const ro = new ResizeObserver(medirDiferido);
    ro.observe(cont);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, ...deps]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollEl,
    estimateSize: () => altoEstimado,
    overscan: 10,
    scrollMargin: offset,
  });

  const filas = virtualizer.getVirtualItems();
  const alturaTotal = virtualizer.getTotalSize();
  const margen = virtualizer.options.scrollMargin;

  return {
    contenedorRef,
    /** Las filas que hay que dibujar. Cada una trae `index` para sacar el dato del array. */
    filas,
    alturaTotal,
    rellenoArriba: filas.length > 0 ? filas[0].start - margen : 0,
    rellenoAbajo: filas.length > 0 ? alturaTotal - (filas[filas.length - 1].end - margen) : 0,
    /** Para medir el alto real de cada fila (mejora la estimación sobre la marcha). */
    medirFila: virtualizer.measureElement,
  };
}
