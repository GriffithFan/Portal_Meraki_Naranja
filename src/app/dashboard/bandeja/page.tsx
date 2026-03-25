"use client";

import { useState, useEffect, useCallback } from "react";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIPO_ICON_PATHS: Record<string, string> = {
  ALERTA_MONITOREO: "M8.288 15.038a5.25 5.25 0 017.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 011.06 0z",
  MONITOREO_OK: "M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z",
  TAREA: "M11.35 3.836c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m8.9-4.414c.376.023.75.05 1.124.08 1.131.094 1.976 1.057 1.976 2.192V16.5A2.25 2.25 0 0118 18.75h-2.25m-7.5-10.5H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V18.75M8.25 8.25h3.75M8.25 11.25h3.75M8.25 14.25h2.25",
  CHANGELOG: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z",
  ALERTA: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z",
  RECORDATORIO: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z",
  GENERAL: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0",
};

const TIPO_ICON_COLORS: Record<string, string> = {
  TAREA: "text-blue-500",
  GENERAL: "text-surface-400",
  ALERTA: "text-red-500",
  RECORDATORIO: "text-yellow-500",
  CHANGELOG: "text-emerald-500",
  ALERTA_MONITOREO: "text-orange-500",
  MONITOREO_OK: "text-emerald-500",
};

const TIPO_BG_COLORS: Record<string, string> = {
  TAREA: "bg-blue-50",
  GENERAL: "bg-surface-50",
  ALERTA: "bg-red-50",
  RECORDATORIO: "bg-yellow-50",
  CHANGELOG: "bg-emerald-50",
  ALERTA_MONITOREO: "bg-orange-50",
  MONITOREO_OK: "bg-emerald-50",
};

export default function BandejaPage() {
  const [notificaciones, setNotificaciones] = useState<any[]>([]);
  const [sinLeer, setSinLeer] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState<"todas" | "noLeidas">("todas");

  const fetchNotificaciones = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filtro === "noLeidas") params.set("noLeidas", "true");
    const res = await fetch(`/api/notificaciones?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setNotificaciones(data.notificaciones || []);
      setSinLeer(data.sinLeer || 0);
    }
    setLoading(false);
  }, [filtro]);

  useEffect(() => { fetchNotificaciones(); }, [fetchNotificaciones]);

  async function marcarLeida(id: string) {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ids: [id] }),
    });
    fetchNotificaciones();
  }

  async function marcarTodas() {
    await fetch("/api/notificaciones", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ marcarTodas: true }),
    });
    fetchNotificaciones();
  }

  function getTimeAgo(dateStr: string) {
    return formatDistanceToNow(new Date(dateStr), { addSuffix: true, locale: es });
  }

  const TIPO_LABELS: Record<string, string> = {
    TAREA: "Tarea",
    GENERAL: "General",
    ALERTA: "Alerta",
    RECORDATORIO: "Recordatorio",
    CHANGELOG: "Actualización",
    ALERTA_MONITOREO: "Monitoreo",
    MONITOREO_OK: "Monitoreo OK",
  };

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Bandeja</h1>
          <p className="text-xs text-surface-400">
            Mensajes y notificaciones
            {sinLeer > 0 && <Badge variant="destructive" className="ml-2 text-[10px]">{sinLeer}</Badge>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={filtro}
            onChange={(e) => setFiltro(e.target.value as "todas" | "noLeidas")}
            className="px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
          >
            <option value="todas">Todas</option>
            <option value="noLeidas">Sin leer</option>
          </select>
          {sinLeer > 0 && (
            <button onClick={marcarTodas} className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md transition-colors font-medium">
              Marcar todas leídas
            </button>
          )}
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
        {loading ? (
          <ListSkeleton items={6} />
        ) : notificaciones.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M21.75 9v.906a2.25 2.25 0 01-1.183 1.981l-6.478 3.488M2.25 9v.906a2.25 2.25 0 001.183 1.981l6.478 3.488m8.839 2.51l-4.66-2.51m0 0l-1.023-.55a2.25 2.25 0 00-2.134 0l-1.022.55m0 0l-4.661 2.51m16.5 1.615a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V8.844a2.25 2.25 0 011.183-1.981l7.5-4.039a2.25 2.25 0 012.134 0l7.5 4.039a2.25 2.25 0 011.183 1.98V19.5z" /></svg>
            <p className="text-sm font-medium mb-1">Sin notificaciones</p>
            <p className="text-xs">Tu bandeja está vacía</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100 stagger-children">
            {notificaciones.map((n) => (
              <div
                key={n.id}
                className={`flex items-start gap-3 px-3 sm:px-5 py-3 sm:py-4 transition-all cursor-pointer row-animate active:scale-[0.995] ${n.leida ? "bg-white hover:bg-surface-50" : "bg-primary-50/20 hover:bg-primary-50/40"}`}
                onClick={() => !n.leida && marcarLeida(n.id)}
              >
                <div className={`w-8 h-8 sm:w-9 sm:h-9 rounded-lg flex items-center justify-center shrink-0 ${TIPO_BG_COLORS[n.tipo] || "bg-surface-100"}`}>
                  <svg className={`w-4 h-4 sm:w-[18px] sm:h-[18px] ${TIPO_ICON_COLORS[n.tipo] || "text-surface-400"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.7}>
                    <path strokeLinecap="round" strokeLinejoin="round" d={TIPO_ICON_PATHS[n.tipo] || TIPO_ICON_PATHS.GENERAL} />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <p className={`text-[13px] sm:text-sm truncate ${n.leida ? "text-surface-700" : "text-surface-900 font-semibold"}`}>{n.titulo}</p>
                      {!n.leida && <span className="w-2 h-2 rounded-full bg-accent-500 shrink-0" />}
                    </div>
                    <span className="text-[10px] text-surface-300 shrink-0 hidden sm:block">{getTimeAgo(n.createdAt)}</span>
                  </div>
                  <p className="text-xs text-surface-500 mt-1 whitespace-pre-line line-clamp-2 sm:line-clamp-3">{n.mensaje}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <Badge variant="secondary" className={`text-[10px] ${TIPO_BG_COLORS[n.tipo] || "bg-surface-100"} ${TIPO_ICON_COLORS[n.tipo] || "text-surface-500"}`}>
                      {TIPO_LABELS[n.tipo] || n.tipo}
                    </Badge>
                    <span className="text-[10px] text-surface-300 sm:hidden">{getTimeAgo(n.createdAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
