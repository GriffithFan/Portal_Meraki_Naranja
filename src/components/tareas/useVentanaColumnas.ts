"use client";

import { useCallback, useMemo, useRef, useState } from "react";

/**
 * Virtualiza las COLUMNAS, igual que `useVentanaFilas` hace con las filas.
 *
 * El problema medido: la tabla de tareas de un admin tiene 71 columnas y mide 8.307 px
 * de ancho, pero en pantalla entran 1.224 px, o sea 13 columnas. Las otras 58 —el 82% de
 * cada fila— se dibujan, se les calcula estilo y se pintan enteras, fuera de la vista.
 * Con 20 filas visibles eso son ~4.700 celdas por cuadro de scroll para mostrar 260.
 *
 * Apagando esas columnas con CSS, la mediana del cuadro pasaba de 78 a 57 ms: es la
 * mejora mas grande que quedaba, y no cambia nada de lo que se ve, porque justamente lo
 * que se saca es lo que no se ve.
 *
 * Cada columna ya trae su ancho, asi que no hay que medir nada: alcanza con sumar. Lo
 * que se saltea se reemplaza por una celda vacia del ancho equivalente a cada lado, para
 * que el ancho total de la tabla y la posicion del scroll horizontal no cambien.
 *
 * El desplazamiento lo comparte `FloatingHScrollbar`, que ya mantiene todas las tablas
 * sincronizadas en el mismo scrollLeft: por eso alcanza con UNA ventana para toda la
 * pagina en vez de una por tabla.
 */
export function useVentanaColumnas<C>({
  columnas,
  anchoDe,
  /** Columnas de mas a cada lado, para que un arrastre rapido no muestre huecos. */
  margen = 4,
}: {
  columnas: C[];
  anchoDe: (c: C) => number;
  margen?: number;
}) {
  const [vista, setVista] = useState({ left: 0, ancho: 0 });
  const pendiente = useRef(false);

  /** Lo llama la barra horizontal cuando cambia el desplazamiento compartido. */
  const alDesplazar = useCallback((left: number, ancho: number) => {
    if (pendiente.current) return;
    pendiente.current = true;
    requestAnimationFrame(() => {
      pendiente.current = false;
      setVista((prev) =>
        Math.abs(prev.left - left) < 8 && prev.ancho === ancho ? prev : { left, ancho }
      );
    });
  }, []);

  const ventana = useMemo(() => {
    const anchos = columnas.map(anchoDe);
    // Antes de que la tabla exista todavia no se sabe cuanto entra. Se dibujan las
    // primeras y listo: al montarse llega el ancho real y se recalcula.
    if (!vista.ancho) {
      const hasta = Math.min(columnas.length, 20);
      const anchoDer = anchos.slice(hasta).reduce((a, b) => a + b, 0);
      return { desde: 0, hasta, anchoIzq: 0, anchoDer };
    }

    const izq = vista.left;
    const der = vista.left + vista.ancho;
    let acum = 0;
    let desde = 0;
    let hasta = columnas.length;
    for (let i = 0; i < anchos.length; i++) {
      const fin = acum + anchos[i];
      if (fin <= izq) desde = i + 1;
      if (acum >= der) { hasta = i; break; }
      acum = fin;
    }
    desde = Math.max(0, desde - margen);
    hasta = Math.min(columnas.length, hasta + margen);

    let anchoIzq = 0;
    for (let i = 0; i < desde; i++) anchoIzq += anchos[i];
    let anchoDer = 0;
    for (let i = hasta; i < anchos.length; i++) anchoDer += anchos[i];
    return { desde, hasta, anchoIzq, anchoDer };
  }, [columnas, anchoDe, vista, margen]);

  return {
    ...ventana,
    /** Las columnas que hay que dibujar. */
    visibles: useMemo(() => columnas.slice(ventana.desde, ventana.hasta), [columnas, ventana]),
    alDesplazar,
  };
}
