"use client";

import { useState, useRef, useEffect, useCallback } from "react";

/**
 * Maneja la altura de un panel inferior redimensionable (ej. la sección de
 * Estados del drawer de Campos). Arrastrar el divisor hacia arriba agranda el
 * panel inferior; hacia abajo lo achica. Persiste en localStorage.
 *
 * Uso:
 *   const { height, onHandlePointerDown } = useResizablePanel("pmn-estados-h", 220);
 *   <div className="flex-1 min-h-0 overflow-y-auto">…campos…</div>
 *   <div onPointerDown={onHandlePointerDown} className="cursor-row-resize …" />
 *   <div style={{ height }} className="overflow-y-auto shrink-0">…estados…</div>
 */
export function useResizablePanel(storageKey: string, defaultH = 220, min = 90, max = 600) {
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  const [height, setHeight] = useState(defaultH);
  const drag = useRef<{ startY: number; startH: number } | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) setHeight(clamp(parseInt(saved, 10) || defaultH));
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  useEffect(() => {
    try { localStorage.setItem(storageKey, String(Math.round(height))); } catch { /* ignore */ }
  }, [storageKey, height]);

  const onHandlePointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    drag.current = { startY: e.clientY, startH: height };
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      // El panel está abajo: arrastrar hacia arriba (clientY menor) lo agranda.
      setHeight(clamp(drag.current.startH - (ev.clientY - drag.current.startY)));
    };
    const onUp = () => {
      drag.current = null;
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [height]);

  return { height, onHandlePointerDown };
}
