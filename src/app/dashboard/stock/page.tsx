"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { useSearchContext } from "@/contexts/SearchContext";
import { TableSkeleton } from "@/components/ui/Skeletons";
import SectionSettings from "@/components/ui/SectionSettings";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ESTADOS_EQUIPO = ["DISPONIBLE", "INSTALADO", "EN_TRANSICION", "ROTO", "PERDIDO", "EN_REPARACION"];

const ESTADO_COLORS: Record<string, string> = {
  DISPONIBLE: "bg-green-100 text-green-700",
  INSTALADO: "bg-blue-100 text-blue-700",
  EN_TRANSICION: "bg-yellow-100 text-yellow-700",
  ROTO: "bg-red-100 text-red-700",
  PERDIDO: "bg-gray-100 text-gray-600",
  EN_REPARACION: "bg-orange-100 text-orange-700",
};

export default function StockPage() {
  const { isModOrAdmin } = useSession();
  const { headerSearch } = useSearchContext();
  const [equipos, setEquipos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [search, setSearch] = useState("");

  // Sincronizar búsqueda del Header global
  useEffect(() => { if (headerSearch !== undefined) setSearch(headerSearch); }, [headerSearch]);
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroCat, setFiltroCat] = useState("");
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", marca: "", cantidad: "1", estado: "DISPONIBLE", categoria: "", ubicacion: "", notas: "" });

  const fetchEquipos = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("buscar", search);
    if (filtroEstado) params.set("estado", filtroEstado);
    if (filtroCat) params.set("categoria", filtroCat);
    const res = await fetch(`/api/stock?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEquipos(data.equipos || []);
      setTotal(data.total || 0);
      setCategorias(data.categorias || []);
    }
    setLoading(false);
  }, [search, filtroEstado, filtroCat]);

  useEffect(() => { fetchEquipos(); }, [fetchEquipos]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    const nombre = form.nombre.trim();
    if (!nombre) return;
    const res = await fetch("/api/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ ...form, nombre }),
    });
    if (res.ok) {
      setShowModal(false);
      setForm({ nombre: "", descripcion: "", numeroSerie: "", modelo: "", marca: "", cantidad: "1", estado: "DISPONIBLE", categoria: "", ubicacion: "", notas: "" });
      fetchEquipos();
    }
  }

  async function cambiarEstado(id: string, nuevoEstado: string) {
    if (!confirm(`¿Cambiar estado a ${nuevoEstado.replace(/_/g, " ")}?`)) return;
    await fetch(`/api/stock/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado: nuevoEstado }),
    });
    fetchEquipos();
  }

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Stock</h1>
          <p className="text-xs text-surface-400">Inventario de equipos · {total} registros</p>
        </div>
        <div className="flex items-center gap-1.5">
          <SectionSettings seccion="stock">
            <p className="text-[10px] text-surface-400 italic">Próximamente: opciones de vista y columnas visibles</p>
          </SectionSettings>
          {isModOrAdmin && (
            <button onClick={() => setShowModal(true)} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" /></svg>
              Agregar equipo
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar equipo..." className="flex-1 min-w-0 px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
        <select value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)} className="px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
          <option value="">Todos los estados</option>
          {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
        </select>
        {categorias.length > 0 && (
          <select value={filtroCat} onChange={(e) => setFiltroCat(e.target.value)} className="px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
            <option value="">Todas las categorías</option>
            {categorias.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border border-surface-200 overflow-x-auto">
        {loading ? (
          <TableSkeleton rows={6} cols={6} />
        ) : equipos.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <svg className="w-10 h-10 mx-auto mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" /></svg>
            <p className="text-sm font-medium mb-1">Sin equipos</p>
            <p className="text-xs">{search || filtroEstado ? "No se encontraron resultados" : "Agrega tu primer equipo al inventario"}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-surface-200">
              <tr>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Equipo</th>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Modelo / Marca</th>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">N/S</th>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Cant.</th>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Estado</th>
                <th className="text-left px-2.5 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Ubicación</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-100">
              {equipos.map((eq) => (
                <tr key={eq.id} className="hover:bg-surface-50 transition-colors">
                  <td className="px-2.5 py-1.5">
                    <div className="font-medium text-surface-800 text-[11px]">{eq.nombre}</div>
                    {eq.categoria && <span className="text-[10px] text-surface-400">{eq.categoria}</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-surface-600 text-[11px]">
                    {eq.modelo || "—"}
                    {eq.marca && <span className="text-[10px] text-surface-400 ml-1">({eq.marca})</span>}
                  </td>
                  <td className="px-2.5 py-1.5 text-surface-500 font-mono text-[10px]">{eq.numeroSerie || "—"}</td>
                  <td className="px-2.5 py-1.5 text-surface-600 text-[11px]">{eq.cantidad}</td>
                  <td className="px-2.5 py-1.5">
                    {isModOrAdmin ? (
                      <select
                        value={eq.estado}
                        onChange={(e) => cambiarEstado(eq.id, e.target.value)}
                        className={`px-2 py-1 rounded-lg text-xs font-medium border-0 cursor-pointer ${ESTADO_COLORS[eq.estado] || "bg-gray-100 text-gray-600"}`}
                      >
                        {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                      </select>
                    ) : (
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ESTADO_COLORS[eq.estado] || "bg-gray-100 text-gray-600"}`}>
                        {eq.estado.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <td className="px-2.5 py-1.5 text-surface-500 text-[11px]">{eq.ubicacion || eq.predio?.nombre || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal crear equipo */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleCreate} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-surface-800 mb-4">Agregar Equipo</h2>
            <div className="space-y-3">
              <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre *" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} placeholder="Modelo" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <input value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} placeholder="Marca" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <input value={form.numeroSerie} onChange={(e) => setForm({ ...form, numeroSerie: e.target.value })} placeholder="Número de serie" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input type="number" min="1" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} placeholder="Cantidad" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
                <select value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value })} className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400">
                  {ESTADOS_EQUIPO.map((e) => <option key={e} value={e}>{e.replace(/_/g, " ")}</option>)}
                </select>
                <input value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })} placeholder="Categoría" className="px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              </div>
              <input value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} placeholder="Ubicación" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" className="px-4 py-2 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium">Crear</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
