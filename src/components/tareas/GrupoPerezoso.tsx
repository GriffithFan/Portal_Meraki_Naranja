"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Monta el contenido de un grupo solo cuando está cerca de la pantalla.
 *
 * El problema medido: hay un virtualizador POR GRUPO, y cada uno mantiene sus filas
 * montadas aunque el grupo esté lejos de la vista. Con 13 grupos abiertos eso son ~270
 * filas en el DOM cuando la ventana muestra 15. Y el costo no es dibujarlas: es que el
 * navegador recalcule el estilo de todo ese árbol cada vez que algo cambia. En el perfil
 * del scroll, recalcular estilo era el 34% del tiempo contra 9% de JavaScript.
 *
 * Antes probé `content-visibility: auto`, que es la versión CSS de esta idea, y no sirve
 * acá: el contenido "saltado" no se puede medir, y el virtualizador de adentro necesita
 * medir su posición. Dejaba la tabla vacía. Hecho en React sí funciona, porque cuando el
 * grupo entra se monta de verdad y todo se mide normal.
 *
 * Mientras está lejos se deja un hueco del mismo alto, así la barra de scroll no salta.
 * El margen de 900 px hace que se monte bastante antes de verse, para que nunca se llegue
 * a un espacio en blanco al scrollear rápido.
 *
 * EL ALTO SE LEE DEL OBSERVADOR, NO DEL DOM. Es la parte que importa. La versión obvia
 * —un `useLayoutEffect` que llama a `getBoundingClientRect()`— mide bien pero corre
 * después de CADA render del grupo, y cada llamada obliga al navegador a recalcular el
 * layout ahí mismo. Medido: la mediana del cuadro quedaba en 17 ms pero el p90 se iba a
 * 231 ms y el peor caso a 557 ms; es decir, el scroll iba fluido y cada tanto pegaba un
 * tirón. `IntersectionObserver` ya trae la caja del elemento calculada en `entry`, gratis
 * y fuera del hilo principal, y justo en el momento que hace falta: cuando el grupo sale.
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
  const [alto, setAlto] = useState(altoEstimado);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entrada]) => {
        // La caja viene calculada en la entrada: leerla no cuesta un layout.
        const h = entrada.boundingClientRect.height;
        if (h > 0) setAlto((prev) => (Math.abs(prev - h) > 4 ? h : prev));
        setCerca(entrada.isIntersecting);
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={cerca ? undefined : { height: alto }}>
      {cerca ? children : null}
    </div>
  );
}
