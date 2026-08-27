"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
  const altoRef = useRef(altoEstimado);
  const [, forzar] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entrada]) => setCerca(entrada.isIntersecting),
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Se guarda el alto real ANTES de desmontar, para que el hueco mida lo mismo que medía
  // el grupo. Sin esto la página se sacude cada vez que un grupo entra o sale.
  useLayoutEffect(() => {
    if (!cerca) return;
    const el = ref.current;
    if (!el) return;
    const h = el.getBoundingClientRect().height;
    if (h > 0 && Math.abs(h - altoRef.current) > 4) {
      altoRef.current = h;
      forzar((n) => n + 1);
    }
  });

  return (
    <div ref={ref} style={cerca ? undefined : { height: altoRef.current }}>
      {cerca ? children : null}
    </div>
  );
}
