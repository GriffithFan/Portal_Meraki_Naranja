"use client";
import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Barra de scroll horizontal flotante, fija al pie del área visible del listado.
 * Sincroniza el scroll horizontal de TODAS las tablas de estado (clase `.js-hscroll`)
 * dentro de `scopeRef`, para no tener que bajar al fondo de una tabla larga para
 * alcanzar la barra nativa. También: Shift + rueda mueve horizontal.
 */
export default function FloatingHScrollbar({
  scopeRef,
  selector = ".js-hscroll",
}: {
  scopeRef: React.RefObject<HTMLElement | null>;
  selector?: string;
}) {
  const barRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  // Desplazamiento horizontal compartido por todas las tablas. Hace falta guardarlo
  // porque los grupos fuera de pantalla usan `content-visibility: auto`: mientras
  // estan salteados no tienen layout, escribirles scrollLeft no hace nada y al
  // aparecer volverian a la primera columna. Se les reaplica al entrar en pantalla.
  const leftRef = useRef(0);
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);

  const getTables = useCallback(() => {
    const scope = scopeRef.current;
    return scope ? Array.from(scope.querySelectorAll<HTMLElement>(selector)) : [];
  }, [scopeRef, selector]);

  // Medir lee scrollWidth/clientWidth de TODAS las tablas: eso fuerza al navegador
  // a recalcular layout en el acto. Antes se llamaba en cada mutacion del DOM del
  // listado (sin throttle), asi que scrollear o cargar un grupo disparaba decenas de
  // reflows. Ahora se agenda un solo `measure` por frame y solo se toca el estado de
  // React si el valor realmente cambio.
  const medirPendiente = useRef(false);
  const reobservarRef = useRef<(() => void) | null>(null);
  const measure = useCallback(() => {
    const tables = getTables();
    let maxScroll = 0;
    let client = 0;
    for (const t of tables) {
      maxScroll = Math.max(maxScroll, t.scrollWidth);
      client = Math.max(client, t.clientWidth);
    }
    setWidth((prev) => (prev === maxScroll ? prev : maxScroll));
    const hayOverflow = maxScroll > client + 2;
    setOverflow((prev) => (prev === hayOverflow ? prev : hayOverflow));
  }, [getTables]);

  const medirDiferido = useCallback(() => {
    if (medirPendiente.current) return;
    medirPendiente.current = true;
    requestAnimationFrame(() => {
      medirPendiente.current = false;
      measure();
      reobservarRef.current?.();
    });
  }, [measure]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    measure();

    const ro = new ResizeObserver(medirDiferido);
    ro.observe(scope);

    // El comentario de antes decia "solo interesan las altas/bajas de tablas", pero el
    // observador no filtraba nada: recibia TODA mutacion del subarbol. Y el virtualizador
    // agrega y saca filas en cada cuadro de scroll, asi que disparaba una medicion por
    // cuadro, y medir lee scrollWidth/clientWidth de ~13 tablas -> layout forzado por
    // cuadro. En el perfil del scroll esta funcion sola era el 31,9% del tiempo de CPU.
    //
    // Que entren y salgan filas no cambia el ancho de la tabla. Lo unico que importa es
    // que aparezca o desaparezca una tabla entera (un grupo que se abre o se cierra).
    const mo = new MutationObserver((registros) => {
      for (const r of registros) {
        for (const lista of [r.addedNodes, r.removedNodes]) {
          for (const nodo of Array.from(lista)) {
            if (!(nodo instanceof Element)) continue;
            if (nodo.matches(selector) || nodo.querySelector(selector)) {
              medirDiferido();
              return;
            }
          }
        }
      }
    });
    mo.observe(scope, { childList: true, subtree: true });

    // Si una tabla cambia de ancho de verdad —columnas nuevas, un valor mas largo— hay
    // que remedir igual. `ResizeObserver` da el tamano ya calculado en `contentRect`, sin
    // forzar layout, y se ignora el alto: al agregarse filas cambia el alto, no el ancho.
    const anchos = new WeakMap<Element, number>();
    const roTablas = new ResizeObserver((entradas) => {
      let cambio = false;
      for (const e of entradas) {
        const w = e.contentRect.width;
        if (anchos.get(e.target) !== w) { anchos.set(e.target, w); cambio = true; }
      }
      if (cambio) medirDiferido();
    });

    window.addEventListener("resize", medirDiferido);

    const cls = selector.replace(/^\./, "");
    const onScrollCapture = (e: Event) => {
      if (syncing.current) return;
      const src = e.target as HTMLElement;
      if (!src?.classList?.contains?.(cls)) return;
      syncing.current = true;
      const left = src.scrollLeft;
      leftRef.current = left;
      // Escribir scrollLeft en ~12 contenedores en medio del evento provoca un
      // reflow por cada uno. Se hace todo junto en el frame siguiente.
      requestAnimationFrame(() => {
        if (barRef.current && barRef.current !== src) barRef.current.scrollLeft = left;
        for (const t of getTables()) if (t !== src) t.scrollLeft = left;
        syncing.current = false;
      });
    };
    scope.addEventListener("scroll", onScrollCapture, true);

    // Cuando un grupo salteado vuelve a pantalla, se le devuelve el desplazamiento
    // horizontal para que sus columnas queden alineadas con el resto.
    const io = new IntersectionObserver(
      (entries) => {
        const aCorregir = entries
          .filter((e) => e.isIntersecting)
          .map((e) => e.target as HTMLElement)
          .filter((t) => t.scrollLeft !== leftRef.current);
        if (aCorregir.length === 0) return;
        // Escribir scrollLeft dispara un evento de scroll: sin este candado,
        // `onScrollCapture` lo tomaria como un scroll del usuario y volveria a
        // sincronizar todas las tablas en bucle.
        syncing.current = true;
        for (const t of aCorregir) t.scrollLeft = leftRef.current;
        requestAnimationFrame(() => { syncing.current = false; });
      },
      { root: null, rootMargin: "200px" }
    );
    const observarTablas = () => {
      io.disconnect();
      roTablas.disconnect();
      for (const t of getTables()) {
        io.observe(t);
        const interior = t.firstElementChild;
        if (interior) roTablas.observe(interior);
      }
    };
    observarTablas();
    // Se engancha al mismo ciclo throttleado que la medicion: un segundo
    // MutationObserver sin throttle era exactamente el problema que se acaba de sacar.
    reobservarRef.current = observarTablas;

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || e.deltaY === 0) return;
      const target = (e.target as HTMLElement)?.closest?.(selector) as HTMLElement | null;
      if (!target) return;
      target.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    scope.addEventListener("wheel", onWheel, { passive: false, capture: true });

    return () => {
      ro.disconnect();
      roTablas.disconnect();
      mo.disconnect();
      window.removeEventListener("resize", medirDiferido);
      io.disconnect();
      reobservarRef.current = null;
      scope.removeEventListener("scroll", onScrollCapture, true);
      scope.removeEventListener("wheel", onWheel, true);
    };
  }, [scopeRef, selector, measure, getTables]);

  const onBarScroll = () => {
    if (syncing.current || !barRef.current) return;
    syncing.current = true;
    const left = barRef.current.scrollLeft;
    leftRef.current = left;
    for (const t of getTables()) t.scrollLeft = left;
    requestAnimationFrame(() => { syncing.current = false; });
  };

  if (!overflow) return null;

  return (
    <div
      ref={barRef}
      onScroll={onBarScroll}
      aria-hidden
      title="Desplazar columnas (Shift + rueda también funciona)"
      // Sin backdrop-blur ni translucidez: es un elemento sticky, o sea que el navegador
      // lo recompone en cada frame de scroll, y el desenfoque del fondo hacia que ese
      // trabajo fuera carisimo. Fondo opaco = solo se copia el pixel.
      className="pmn-hscrollbar hidden md:block sticky bottom-0 z-30 overflow-x-auto overflow-y-hidden rounded-t-md border-t border-surface-200 bg-white shadow-[0_-2px_6px_rgba(0,0,0,0.06)] dark:border-surface-700 dark:bg-surface-800"
      style={{ height: 16 }}
    >
      <div style={{ width, height: 1 }} />
    </div>
  );
}
