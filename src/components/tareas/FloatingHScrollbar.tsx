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
  const [width, setWidth] = useState(0);
  const [overflow, setOverflow] = useState(false);

  const getTables = useCallback(() => {
    const scope = scopeRef.current;
    return scope ? Array.from(scope.querySelectorAll<HTMLElement>(selector)) : [];
  }, [scopeRef, selector]);

  const measure = useCallback(() => {
    const tables = getTables();
    let maxScroll = 0;
    let client = 0;
    for (const t of tables) {
      maxScroll = Math.max(maxScroll, t.scrollWidth);
      client = Math.max(client, t.clientWidth);
    }
    setWidth(maxScroll);
    setOverflow(maxScroll > client + 2);
  }, [getTables]);

  useEffect(() => {
    const scope = scopeRef.current;
    if (!scope) return;
    measure();

    const ro = new ResizeObserver(() => measure());
    ro.observe(scope);
    const mo = new MutationObserver(() => measure());
    mo.observe(scope, { childList: true, subtree: true });
    window.addEventListener("resize", measure);

    const cls = selector.replace(/^\./, "");
    const onScrollCapture = (e: Event) => {
      if (syncing.current) return;
      const src = e.target as HTMLElement;
      if (!src?.classList?.contains?.(cls)) return;
      syncing.current = true;
      const left = src.scrollLeft;
      if (barRef.current && barRef.current !== src) barRef.current.scrollLeft = left;
      for (const t of getTables()) if (t !== src) t.scrollLeft = left;
      requestAnimationFrame(() => { syncing.current = false; });
    };
    scope.addEventListener("scroll", onScrollCapture, true);

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
      mo.disconnect();
      window.removeEventListener("resize", measure);
      scope.removeEventListener("scroll", onScrollCapture, true);
      scope.removeEventListener("wheel", onWheel, true);
    };
  }, [scopeRef, selector, measure, getTables]);

  const onBarScroll = () => {
    if (syncing.current || !barRef.current) return;
    syncing.current = true;
    const left = barRef.current.scrollLeft;
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
      className="pmn-hscrollbar hidden md:block sticky bottom-0 z-30 overflow-x-auto overflow-y-hidden rounded-t-md border-t border-surface-200 bg-white/95 shadow-[0_-2px_6px_rgba(0,0,0,0.06)] backdrop-blur-sm dark:border-surface-700 dark:bg-surface-800/95"
      style={{ height: 16 }}
    >
      <div style={{ width, height: 1 }} />
    </div>
  );
}
