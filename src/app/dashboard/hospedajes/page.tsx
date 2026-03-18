"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { IconPlus, IconX, IconTrash, IconEdit } from "@/components/ui/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Hospedaje {
  id: string;
  ubicacion: string;
  nombre: string;
  tipo: string | null;
  garage: string | null;
  telefono: string | null;
  provincia: string | null;
  notas: string | null;
}

export default function HospedajesPage() {
  const { isModOrAdmin } = useSession();
  const [hospedajes, setHospedajes] = useState<Hospedaje[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroProvincia, setFiltroProvincia] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");

  // Modal crear/editar
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ubicacion: "", nombre: "", tipo: "", garage: "", telefono: "", provincia: "", notas: "" });

  // Confirmar eliminación
  const [confirmDelete, setConfirmDelete] = useState<{ id: string; nombre: string } | null>(null);

  const fetchHospedajes = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/hospedajes", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setHospedajes(data.hospedajes || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchHospedajes(); }, [fetchHospedajes]);

  const provincias = useMemo(() => {
    const set = new Set<string>();
    hospedajes.forEach(h => { if (h.provincia) set.add(h.provincia); });
    return Array.from(set).sort();
  }, [hospedajes]);

  const tipos = useMemo(() => {
    const set = new Set<string>();
    hospedajes.forEach(h => { if (h.tipo) set.add(h.tipo.toUpperCase()); });
    return Array.from(set).sort();
  }, [hospedajes]);

  const filtered = useMemo(() => {
    let items = hospedajes;
    if (filtroProvincia) items = items.filter(h => h.provincia === filtroProvincia);
    if (filtroTipo) items = items.filter(h => h.tipo?.toUpperCase() === filtroTipo);
    if (search) {
      const q = search.toLowerCase();
      items = items.filter(h =>
        h.nombre.toLowerCase().includes(q) ||
        h.ubicacion.toLowerCase().includes(q) ||
        h.provincia?.toLowerCase().includes(q) ||
        h.telefono?.includes(q)
      );
    }
    return items;
  }, [hospedajes, search, filtroProvincia, filtroTipo]);

  // Agrupar por provincia
  const grouped = useMemo(() => {
    const map = new Map<string, Hospedaje[]>();
    for (const h of filtered) {
      const prov = h.provincia || "Sin provincia";
      if (!map.has(prov)) map.set(prov, []);
      map.get(prov)!.push(h);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  function openCreate() {
    setEditingId(null);
    setForm({ ubicacion: "", nombre: "", tipo: "", garage: "", telefono: "", provincia: "", notas: "" });
    setShowModal(true);
  }

  function openEdit(h: Hospedaje) {
    setEditingId(h.id);
    setForm({
      ubicacion: h.ubicacion,
      nombre: h.nombre,
      tipo: h.tipo || "",
      garage: h.garage || "",
      telefono: h.telefono || "",
      provincia: h.provincia || "",
      notas: h.notas || "",
    });
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const url = editingId ? `/api/hospedajes/${editingId}` : "/api/hospedajes";
    const method = editingId ? "PATCH" : "POST";
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });
    if (res.ok) {
      setShowModal(false);
      fetchHospedajes();
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    const res = await fetch(`/api/hospedajes/${confirmDelete.id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (res.ok) {
      setConfirmDelete(null);
      fetchHospedajes();
    }
  }

  const GARAGE_COLORS: Record<string, string> = {
    "SI": "bg-emerald-50 text-emerald-600 border-emerald-200",
    "NO": "bg-red-50 text-red-500 border-red-200",
    "SI PAGO": "bg-amber-50 text-amber-600 border-amber-200",
  };

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Hospedajes</h1>
          <p className="text-xs text-surface-400 mt-0.5">
            {loading ? "Cargando..." : `${filtered.length} hospedajes`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isModOrAdmin && (
            <button
              onClick={openCreate}
              className="px-2.5 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1"
            >
              <IconPlus className="w-3.5 h-3.5" />
              Nuevo
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre, ubicación, teléfono..."
          className="flex-1 min-w-[200px] px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
        />
        <select
          value={filtroProvincia}
          onChange={(e) => setFiltroProvincia(e.target.value)}
          className="px-2 py-1.5 border border-surface-200 rounded-md text-xs"
        >
          <option value="">Todas las provincias</option>
          {provincias.map(p => <option key={p} value={p}>{p}</option>)}
        </select>
        <select
          value={filtroTipo}
          onChange={(e) => setFiltroTipo(e.target.value)}
          className="px-2 py-1.5 border border-surface-200 rounded-md text-xs"
        >
          <option value="">Todos los tipos</option>
          {tipos.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
        {(search || filtroProvincia || filtroTipo) && (
          <button
            onClick={() => { setSearch(""); setFiltroProvincia(""); setFiltroTipo(""); }}
            className="px-2 py-1.5 text-xs text-red-600 hover:bg-red-50 rounded-md"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Tabla */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-surface-400">
          <p className="text-sm">No hay hospedajes</p>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([provincia, items]) => (
            <div key={provincia} className="bg-white border border-surface-200 rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-surface-50 border-b border-surface-200 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary-500" />
                <span className="text-sm font-medium text-surface-700">{provincia}</span>
                <span className="text-[11px] text-surface-400 tabular-nums">{items.length}</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-max text-[11px]">
                  <thead>
                    <tr className="border-b border-surface-100">
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[140px]">Ubicación</th>
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[180px]">Nombre</th>
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[120px]">Tipo</th>
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[80px]">Garage</th>
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[120px]">Teléfono</th>
                      <th className="text-left px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[200px]">Notas</th>
                      {isModOrAdmin && (
                        <th className="text-right px-3 py-1.5 font-medium text-surface-400 uppercase text-[10px] tracking-wider w-[70px]">Acciones</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((h) => (
                      <tr key={h.id} className="border-b border-surface-50 hover:bg-surface-50 transition-colors">
                        <td className="px-3 py-2 text-surface-700 font-medium">{h.ubicacion}</td>
                        <td className="px-3 py-2 text-surface-800 font-semibold">{h.nombre}</td>
                        <td className="px-3 py-2">
                          <span className="px-1.5 py-0.5 bg-surface-100 text-surface-600 rounded text-[10px] font-medium">
                            {h.tipo || "—"}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {h.garage ? (
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${GARAGE_COLORS[h.garage.toUpperCase()] || "bg-surface-50 text-surface-500 border-surface-200"}`}>
                              {h.garage}
                            </span>
                          ) : <span className="text-surface-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-surface-600 tabular-nums">
                          {h.telefono ? (
                            <a href={`tel:${h.telefono}`} className="hover:text-primary-600 hover:underline">
                              {h.telefono}
                            </a>
                          ) : <span className="text-surface-300">—</span>}
                        </td>
                        <td className="px-3 py-2 text-surface-500 truncate max-w-[200px]">{h.notas || "—"}</td>
                        {isModOrAdmin && (
                          <td className="px-3 py-2 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => openEdit(h)}
                                className="p-1 text-surface-400 hover:text-primary-600 rounded transition-colors"
                                title="Editar"
                              >
                                <IconEdit className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setConfirmDelete({ id: h.id, nombre: h.nombre })}
                                className="p-1 text-surface-400 hover:text-red-600 rounded transition-colors"
                                title="Eliminar"
                              >
                                <IconTrash className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear/Editar */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-surface-800">
                {editingId ? "Editar hospedaje" : "Nuevo hospedaje"}
              </h2>
              <button onClick={() => setShowModal(false)} className="text-surface-400 hover:text-surface-600">
                <IconX className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Ubicación *</label>
                  <input
                    type="text"
                    value={form.ubicacion}
                    onChange={(e) => setForm(f => ({ ...f, ubicacion: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                    required
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Nombre *</label>
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Tipo</label>
                  <select
                    value={form.tipo}
                    onChange={(e) => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                  >
                    <option value="">—</option>
                    <option value="CASA">Casa</option>
                    <option value="DEPARTAMENTO">Departamento</option>
                    <option value="HOTEL">Hotel</option>
                    <option value="HOSTEL">Hostel</option>
                    <option value="POSADA">Posada</option>
                    <option value="QUINTA/CASA">Quinta/Casa</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Garage</label>
                  <select
                    value={form.garage}
                    onChange={(e) => setForm(f => ({ ...f, garage: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                  >
                    <option value="">—</option>
                    <option value="SI">Sí</option>
                    <option value="NO">No</option>
                    <option value="SI PAGO">Sí (Pago)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-surface-500 mb-1">Provincia</label>
                  <input
                    type="text"
                    value={form.provincia}
                    onChange={(e) => setForm(f => ({ ...f, provincia: e.target.value }))}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                    placeholder="Ej: BUENOS AIRES"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Teléfono</label>
                <input
                  type="text"
                  value={form.telefono}
                  onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400"
                  placeholder="Ej: 2234949509"
                />
              </div>
              <div>
                <label className="block text-[11px] font-medium text-surface-500 mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none"
                  rows={2}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700"
                >
                  {editingId ? "Guardar" : "Crear"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30" onClick={() => setConfirmDelete(null)}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-surface-800 mb-2">Eliminar hospedaje</h3>
            <p className="text-xs text-surface-500 mb-4">
              ¿Eliminar <strong>{confirmDelete.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmDelete(null)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md">
                Cancelar
              </button>
              <button onClick={handleDelete} className="px-3 py-1.5 bg-red-600 text-white rounded-md text-xs font-medium hover:bg-red-700">
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
