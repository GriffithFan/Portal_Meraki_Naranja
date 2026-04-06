"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { motion } from "framer-motion";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ACCION_CONF: Record<string, { label: string; color: string }> = {
  LOGIN: { label: "Inicio de sesión", color: "bg-emerald-500" },
  CONSULTA_PREDIO: { label: "Consulta predio", color: "bg-blue-500" },
};

const PAGE_SIZE = 50;

export default function AuditoriaPage() {
  const { session } = useSession();
  const [registros, setRegistros] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);

  // Filtros
  const [filtroAccion, setFiltroAccion] = useState("");
  const [filtroUsuario, setFiltroUsuario] = useState("");
  const [filtroDesde, setFiltroDesde] = useState("");
  const [filtroHasta, setFiltroHasta] = useState("");
  const [usuarios, setUsuarios] = useState<any[]>([]);

  // Cargar lista de usuarios para el filtro
  useEffect(() => {
    fetch("/api/usuarios", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUsuarios(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  const fetchRegistros = useCallback(
    async (offset = 0, append = false) => {
      if (!append) setLoading(true);
      else setLoadingMore(true);

      const params = new URLSearchParams();
      if (filtroAccion) params.set("accion", filtroAccion);
      if (filtroUsuario) params.set("userId", filtroUsuario);
      if (filtroDesde) params.set("desde", filtroDesde);
      if (filtroHasta) params.set("hasta", filtroHasta);
      params.set("limite", String(PAGE_SIZE));
      params.set("offset", String(offset));

      const res = await fetch(`/api/auditoria?${params}`, { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        const nuevos = data.registros || [];
        setRegistros((prev) => (append ? [...prev, ...nuevos] : nuevos));
        setTotal(data.total || 0);
        setHasMore(nuevos.length >= PAGE_SIZE);
      }
      if (!append) setLoading(false);
      else setLoadingMore(false);
    },
    [filtroAccion, filtroUsuario, filtroDesde, filtroHasta]
  );

  useEffect(() => {
    if (session?.rol === "ADMIN") fetchRegistros();
  }, [fetchRegistros, session?.rol]);

  // Gate: solo ADMIN
  if (session && session.rol !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-surface-400 text-sm">
        <svg className="w-12 h-12 mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
        </svg>
        Solo administradores pueden ver la auditoría
      </div>
    );
  }

  const inputClass =
    "h-9 rounded-lg border border-surface-200 bg-white px-3 text-sm text-surface-700 focus:outline-none focus:ring-2 focus:ring-brand-500/30 dark:border-surface-700 dark:bg-surface-800 dark:text-surface-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="max-w-5xl mx-auto space-y-5 p-4 sm:p-6"
    >
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-surface-800 dark:text-surface-100">
          Auditoría de accesos
        </h1>
        <p className="text-sm text-surface-500 mt-1">
          Registro de inicios de sesión y consultas de predios
          {total > 0 && (
            <span className="ml-2 text-surface-400">({total} registros)</span>
          )}
        </p>
      </div>

      {/* Filtros */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500">Acción</label>
              <select
                value={filtroAccion}
                onChange={(e) => setFiltroAccion(e.target.value)}
                className={inputClass}
              >
                <option value="">Todas</option>
                <option value="LOGIN">Inicios de sesión</option>
                <option value="CONSULTA_PREDIO">Consultas de predio</option>
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500">Usuario</label>
              <select
                value={filtroUsuario}
                onChange={(e) => setFiltroUsuario(e.target.value)}
                className={inputClass}
              >
                <option value="">Todos</option>
                {usuarios.map((u: any) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre} ({u.rol})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500">Desde</label>
              <input
                type="date"
                value={filtroDesde}
                onChange={(e) => setFiltroDesde(e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-surface-500">Hasta</label>
              <input
                type="date"
                value={filtroHasta}
                onChange={(e) => setFiltroHasta(e.target.value)}
                className={inputClass}
              />
            </div>

            {(filtroAccion || filtroUsuario || filtroDesde || filtroHasta) && (
              <button
                onClick={() => {
                  setFiltroAccion("");
                  setFiltroUsuario("");
                  setFiltroDesde("");
                  setFiltroHasta("");
                }}
                className="h-9 px-3 rounded-lg text-xs font-medium text-surface-500 hover:text-surface-800 hover:bg-surface-100 dark:hover:text-surface-200 dark:hover:bg-surface-700 transition-colors"
              >
                Limpiar filtros
              </button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4">
              <ListSkeleton items={8} />
            </div>
          ) : registros.length === 0 ? (
            <div className="text-center py-16 text-surface-400">
              <svg className="w-10 h-10 mx-auto mb-3 opacity-40" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
              <p className="text-sm font-medium">Sin registros de auditoría</p>
              <p className="text-xs mt-1">Los accesos se registrarán a partir de ahora</p>
            </div>
          ) : (
            <div className="divide-y divide-surface-100 dark:divide-surface-700">
              {registros.map((r: any) => {
                const conf = ACCION_CONF[r.accion] || { label: r.accion, color: "bg-surface-400" };
                return (
                  <div
                    key={r.id}
                    className="flex items-start gap-3 px-4 sm:px-5 py-3 sm:py-4 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors"
                  >
                    <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${conf.color}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-surface-800 dark:text-surface-200 leading-snug">
                        <span className="font-medium">{r.usuario?.nombre || "—"}</span>
                        {" — "}
                        {conf.label}
                        {r.detalle && (
                          <span className="text-surface-500 dark:text-surface-400">
                            {" · "}{r.detalle}
                          </span>
                        )}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mt-1.5 text-xs text-surface-400">
                        <Badge variant="secondary">{conf.label}</Badge>
                        {r.usuario?.rol && (
                          <span className="text-surface-400">{r.usuario.rol}</span>
                        )}
                        {r.ip && <span className="font-mono">{r.ip}</span>}
                        <span>
                          {format(new Date(r.createdAt), "dd MMM yyyy, HH:mm:ss", { locale: es })}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {hasMore && (
                <div className="text-center py-4">
                  <button
                    onClick={() => fetchRegistros(registros.length, true)}
                    disabled={loadingMore}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                  >
                    {loadingMore ? "Cargando..." : "Cargar más"}
                  </button>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
