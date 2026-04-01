"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";

const LABEL_MAP: Record<string, string> = {
  dashboard: "Inicio",
  topologia: "Topología",
  switches: "Switches",
  aps: "Puntos de Acceso",
  appliance: "Appliance",
  tareas: "Tareas",
  calendario: "Calendario",
  stock: "Stock",
  importar: "Importar",
  bandeja: "Bandeja",
  actividad: "Actividad",
  instructivo: "Instructivo",
  actas: "Actas",
  usuarios: "Usuarios",
  predios: "Predios",
  espacio: "Espacio",
};

// Segmentos intermedios sin página propia: redirigir al padre
const SKIP_SEGMENTS = new Set(["espacio"]);

// CUIDs: 25 chars alphanumeric starting with a letter
const CUID_RE = /^[a-z][a-z0-9]{24}$/;

export default function Breadcrumbs() {
  const pathname = usePathname();
  const segments = pathname.split("/").filter(Boolean);
  const [dynamicLabels, setDynamicLabels] = useState<Record<string, string>>({});

  // Resolve dynamic IDs to human-readable names
  useEffect(() => {
    const toResolve: { seg: string; prevSeg: string; idx: number }[] = [];
    segments.forEach((seg, i) => {
      if (CUID_RE.test(seg) && !dynamicLabels[seg]) {
        toResolve.push({ seg, prevSeg: segments[i - 1] || "", idx: i });
      }
    });

    if (toResolve.length === 0) return;

    toResolve.forEach(async ({ seg, prevSeg }) => {
      try {
        let name = "";
        if (prevSeg === "espacio") {
          const res = await fetch(`/api/espacios/${seg}`, { credentials: "include" });
          if (res.ok) {
            const data = await res.json();
            name = data.espacio?.nombre || "";
          }
        }
        if (name) {
          setDynamicLabels(prev => ({ ...prev, [seg]: name }));
        }
      } catch { /* ignore */ }
    });
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  if (segments.length <= 1) return null;

  const crumbs = segments
    .map((seg, i) => {
      const href = "/" + segments.slice(0, i + 1).join("/");
      const label = LABEL_MAP[seg] || dynamicLabels[seg] || (CUID_RE.test(seg) ? "…" : decodeURIComponent(seg));
      const isLast = i === segments.length - 1;
      return { href, label, isLast, skip: SKIP_SEGMENTS.has(seg) };
    })
    .filter(c => !c.skip);

  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-surface-400 mb-4">
      {crumbs.map((c, i) => (
        <span key={c.href} className="flex items-center gap-1.5">
          {i > 0 && (
            <svg className="w-3 h-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
            </svg>
          )}
          {c.isLast ? (
            <span className="text-surface-600 font-medium">{c.label}</span>
          ) : (
            <Link href={c.href} className="hover:text-surface-600 transition-colors">{c.label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}
