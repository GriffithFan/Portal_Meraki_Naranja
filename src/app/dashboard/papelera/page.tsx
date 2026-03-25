"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSession } from "@/hooks/useSession";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

const TIPO_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  PREDIO:       { label: "Tarea / Predio",  color: "#3b82f6", icon: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" },
  EQUIPO:       { label: "Stock / Equipo",  color: "#f59e0b", icon: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
  CALENDARIO:   { label: "Evento Calendario", color: "#8b5cf6", icon: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
  ACTA:         { label: "Acta",            color: "#10b981", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  INSTRUCTIVO:  { label: "Instructivo",     color: "#ec4899", icon: "M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" },
  HOSPEDAJE:    { label: "Hospedaje",       color: "#06b6d4", icon: "M2.25 12l8.954-8.955a1.126 1.126 0 011.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" },
  FACTURACION:  { label: "Facturación",     color: "#84cc16", icon: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
};

export default function PapeleraPage() {
  const { session } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState<string>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmVaciar, setConfirmVaciar] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/papelera", { credentials: "include" });
    if (res.ok) {
      const d = await res.json();
      setItems(d.items || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const filteredItems = useMemo(() => {
    let list = items;
    if (filterTipo !== "ALL") list = list.filter(i => i.tipo === filterTipo);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(i => i.nombre.toLowerCase().includes(s) || i.tipo.toLowerCase().includes(s));
    }
    return list;
  }, [items, filterTipo, search]);

  const tiposPresentes = useMemo(() => {
    const set = new Set(items.map(i => i.tipo));
    return Array.from(set).sort();
  }, [items]);

  const handleRestore = async (id: string) => {
    setActionLoading(id);
    const res = await fetch(`/api/papelera?id=${id}`, { method: "PATCH", credentials: "include" });
    if (res.ok) {
      setItems(prev => prev.filter(i => i.id !== id));
    }
    setActionLoading(null);
  };

  const handleDeletePermanently = async (id: string) => {
    toast("¿Eliminar permanentemente? Esta acción no se puede deshacer.", {
      action: {
        label: "Eliminar",
        onClick: async () => {
          setActionLoading(id);
          const res = await fetch(`/api/papelera?id=${id}`, { method: "DELETE", credentials: "include" });
          if (res.ok) {
            setItems(prev => prev.filter(i => i.id !== id));
            toast.success("Eliminado permanentemente");
          }
          setActionLoading(null);
        },
      },
    });
  };

  const handleVaciar = async () => {
    const res = await fetch("/api/papelera?all=true", { method: "DELETE", credentials: "include" });
    if (res.ok) {
      setItems([]);
      setConfirmVaciar(false);
    }
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (session?.rol !== "ADMIN") {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-surface-400 text-sm">
        Solo administradores pueden acceder a la papelera
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-red-50 flex items-center justify-center">
            <svg className="w-4.5 h-4.5 text-red-500" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-surface-800">Papelera</h1>
            <p className="text-xs text-surface-400">{items.length} elemento{items.length !== 1 ? "s" : ""} eliminado{items.length !== 1 ? "s" : ""}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {items.length > 0 && (
            confirmVaciar ? (
              <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 rounded-lg px-3 py-1.5">
                <span className="text-xs text-red-600">¿Vaciar todo?</span>
                <button onClick={handleVaciar} className="text-xs font-medium text-red-600 hover:text-red-800 px-2 py-0.5 rounded hover:bg-red-100">Sí</button>
                <button onClick={() => setConfirmVaciar(false)} className="text-xs text-surface-500 hover:text-surface-700 px-2 py-0.5 rounded hover:bg-surface-100">No</button>
              </div>
            ) : (
              <button onClick={() => setConfirmVaciar(true)} className="text-xs text-red-500 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors">
                Vaciar papelera
              </button>
            )
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <div className="relative flex-1">
          <svg className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-surface-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar en papelera..."
            className="w-full pl-8 pr-3 py-2 border border-surface-200 rounded-lg text-sm bg-white focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
          />
        </div>
        <div className="flex gap-1.5 flex-wrap">
          <button
            onClick={() => setFilterTipo("ALL")}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterTipo === "ALL" ? "bg-surface-800 text-white" : "bg-surface-100 text-surface-500 hover:bg-surface-200"}`}
          >
            Todos
          </button>
          {tiposPresentes.map(tipo => {
            const info = TIPO_LABELS[tipo] || { label: tipo, color: "#94a3b8" };
            return (
              <button
                key={tipo}
                onClick={() => setFilterTipo(tipo)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterTipo === tipo ? "text-white" : "text-surface-600 hover:opacity-80"}`}
                style={filterTipo === tipo ? { backgroundColor: info.color } : { backgroundColor: info.color + "15", color: info.color }}
              >
                {info.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-16 bg-white border border-surface-200 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-surface-300">
          <svg className="w-12 h-12 mb-3" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
          </svg>
          <p className="text-sm font-medium">La papelera está vacía</p>
          <p className="text-xs mt-1">Los elementos eliminados aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filteredItems.map(item => {
            const info = TIPO_LABELS[item.tipo] || { label: item.tipo, color: "#94a3b8", icon: "" };
            const isExpanded = expandedId === item.id;
            const isLoading = actionLoading === item.id;
            const datos = item.datos || {};

            return (
              <div key={item.id} className="bg-white border border-surface-200 rounded-lg overflow-hidden hover:border-surface-300 transition-colors">
                <div className="flex items-center gap-3 px-4 py-3">
                  {/* Icono tipo */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: info.color + "15" }}>
                    {info.icon && (
                      <svg className="w-4 h-4" fill="none" stroke={info.color} strokeWidth={1.7} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d={info.icon} />
                      </svg>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-surface-800 truncate">{item.nombre}</span>
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium flex-shrink-0" style={{ backgroundColor: info.color + "15", color: info.color }}>
                        {info.label}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-surface-400">
                      <span>Eliminado por {item.eliminadoPor?.nombre || "—"}</span>
                      <span>·</span>
                      <span>{formatDate(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Botones */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : item.id)}
                      className="p-1.5 text-surface-400 hover:text-surface-600 hover:bg-surface-100 rounded-md transition-colors"
                      title="Ver detalles"
                    >
                      <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleRestore(item.id)}
                      disabled={isLoading}
                      className="p-1.5 text-emerald-500 hover:text-emerald-700 hover:bg-emerald-50 rounded-md transition-colors disabled:opacity-40"
                      title="Restaurar"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
                      </svg>
                    </button>
                    <button
                      onClick={() => handleDeletePermanently(item.id)}
                      disabled={isLoading}
                      className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-colors disabled:opacity-40"
                      title="Eliminar permanentemente"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>

                {/* Detalle expandible */}
                {isExpanded && (
                  <div className="px-4 pb-3 border-t border-surface-100">
                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                      {Object.entries(datos)
                        .filter(([k]) => !["id", "createdAt", "updatedAt", "camposExtra"].includes(k))
                        .filter(([, v]) => v != null && v !== "")
                        .slice(0, 18)
                        .map(([key, val]) => (
                          <div key={key} className="flex flex-col">
                            <span className="text-surface-400 text-[10px] uppercase tracking-wider">{key}</span>
                            <span className="text-surface-700 truncate">{typeof val === "object" ? JSON.stringify(val) : String(val)}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
