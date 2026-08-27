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
    let frenado: ReturnType<typeof setTimeout> | null = null;
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

    // TRAMPA 4 — observar el contenedor NO alcanza. `ResizeObserver` avisa cuando cambia
    // la caja del elemento observado, y la del contenedor no cambia nunca: lo que cambia
    // es su CONTENIDO. Cuando un grupo de mas arriba crece o se achica —porque su propio
    // virtualizador midio las filas reales— este tbody se corre y su offset queda viejo.
    // El sintoma medido: con la lista arriba de todo, el primer grupo tenia 2.244 px de
    // relleno donde correspondia cero, y al scrollear los grupos se quedaban mostrando
    // siempre las mismas filas.
    //
    // Por eso se observa tambien el contenido, y se vuelve a medir al scrollear. Medir es
    // barato: la guarda de arriba corta antes de tocar el estado si nada se movio, asi que
    // no hay re-render por frame.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [count, ...deps]);

  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scrollEl,
    estimateSize: () => altoEstimado,
    // 3 y no 10: hay un virtualizador POR GRUPO, asi que el overscan se paga 13 veces.
    // Con 10 eran 130 filas de sobra en el DOM, y el costo de tenerlas ahi no es dibujarlas
    // sino que el navegador recalcule su estilo en cada cambio.
    overscan: 3,
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
    /** Estilo para el <tbody>: evita que el navegador trabaje en grupos fuera de pantalla. */
    estiloCuerpo: {
      contentVisibility: "auto" as const,
      containIntrinsicSize: `auto ${Math.max(alturaTotal, 1)}px`,
    },
  };
}
