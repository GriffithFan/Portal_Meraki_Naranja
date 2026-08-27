"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Monta el contenido de un grupo solo cuando está cerca de la pantalla.
 *
 * El problema medido: hay un virtualizador POR GRUPO, y cada uno mantiene sus filas
 * montadas aunque el grupo esté lejos de la vista. Con 13 grupos abiertos eso son ~270
 * filas en el DOM cuando la ventana muestra 15. Y el costo no es dibujarlas: es que el
 * navegador recalcule el estilo de todo ese árbol cada vez que algo cambia.
 *
 * Antes probé `content-visibility: auto`, que es la versión CSS de esta idea, y no sirve
 * acá: el contenido "saltado" no se puede medir, y el virtualizador de adentro necesita
 * medir su posición. Dejaba la tabla vacía. Hecho en React sí funciona, porque cuando el
 * grupo entra se monta de verdad y todo se mide normal.
 *
 * EL HUECO TIENE QUE MEDIR EXACTAMENTE LO QUE MEDÍA EL GRUPO. Es la parte delicada, y
 * la primera versión la tenía mal. Guardaba el alto UNA sola vez, cuando el grupo cruzaba
 * el margen del observador. Pero el virtualizador de adentro sigue afinando el alto de sus
 * filas después de eso —arranca con una estimación y va midiendo las reales—, así que el
 * número guardado quedaba viejo y corto. Resultado: al desmontar, el hueco medía menos que
 * el grupo, la página entera se encogía mientras bajabas y el navegador te recortaba el
 * scroll al nuevo máximo. Medido en Facturado: el alto total caía de 6.163 a 5.122 px
 * durante el descenso y el scroll quedaba trabado; con varios grupos el recorte es mucho
 * mayor y te deja arriba de todo. Era el bug de "llego al final y me tira al inicio".
 *
 * La solución es seguir el alto mientras el grupo está montado, con un `ResizeObserver`:
 * da el tamaño ya calculado en `contentRect` —sin forzar layout, fuera del hilo principal—
 * y avisa cada vez que cambia de verdad. Así el hueco siempre vale lo último que valió el
 * grupo, y la página no cambia de alto al desmontarlo.
 */
export default function GrupoPerezoso({
  children,
  altoEstimado,
}: {
  children: React.ReactNode;
  /** Alto aproximado del grupo, para reservar el hueco antes de haberlo medido nunca. */
  altoEstimado: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [cerca, setCerca] = useState(true); // primer render montado: evita un parpadeo inicial
  const cercaRef = useRef(true);
  const altoRef = useRef(altoEstimado);
  const [alto, setAlto] = useState(altoEstimado);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    const io = new IntersectionObserver(
      ([entrada]) => {
        // El ref se actualiza ANTES que el estado, a proposito: el ResizeObserver de
        // abajo lo consulta y necesita saber que el grupo ya se va en el mismo momento.
        cercaRef.current = entrada.isIntersecting;
        setCerca(entrada.isIntersecting);
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);

    // Mientras el grupo está montado se sigue su alto real. `contentRect` viene calculado,
    // así que leerlo no cuesta un layout. Solo se guarda en un ref: cambiar el estado acá
    // provocaría un render por cada ajuste del virtualizador de adentro, y el valor
    // únicamente hace falta en el momento de desmontar.
    const ro = new ResizeObserver(([entrada]) => {
      // Solo se anota el alto mientras el grupo esta montado. Sin esta guarda el
      // observador vuelve a dispararse DESPUES de desmontar —cuando el envoltorio ya es
      // el hueco vacio— y pisa el alto bueno con el del hueco, que es justo el numero
      // equivocado. Medido: dejaba un escalon de 466 px al desmontar el grupo, y ese
      // escalon es lo que recorta el scroll y te manda arriba.
      if (!cercaRef.current) return;
      const h = entrada.contentRect.height;
      if (h > 0) altoRef.current = h;
    });
    ro.observe(el);

    return () => { io.disconnect(); ro.disconnect(); };
  }, []);

  // Al pasar a "lejos" se congela el último alto conocido para el hueco.
  useEffect(() => {
    if (!cerca) setAlto(altoRef.current);
  }, [cerca]);

  return (
    <div ref={ref} style={cerca ? undefined : { height: alto }}>
      {cerca ? children : null}
    </div>
  );
}
