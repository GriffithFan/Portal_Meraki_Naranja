"use client";

import { useState, useEffect, useRef } from "react";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Factura {
  id: string;
  numero: string | null;
  concepto: string;
  monto: number | null;
  moneda: string;
  fechaEmision: string | null;
  estado: string;
  notas: string | null;
  archivoNombre: string;
  archivoTipo: string;
  archivoSize: number;
  subidoPor: { id: string; nombre: string };
  createdAt: string;
}

const ESTADOS = [
  { clave: "PENDIENTE", label: "Pendiente", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { clave: "APROBADA", label: "Aprobada", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { clave: "RECHAZADA", label: "Rechazada", color: "bg-red-50 text-red-600 border-red-200" },
  { clave: "PAGADA", label: "Pagada", color: "bg-blue-50 text-blue-700 border-blue-200" },
];

function estadoBadge(estado: string) {
  const cfg = ESTADOS.find((e) => e.clave === estado) || ESTADOS[0];
  return `px-1.5 py-0.5 rounded text-[10px] font-semibold border ${cfg.color}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatMonto(monto: number | null, moneda: string) {
  if (monto == null) return "—";
  return new Intl.NumberFormat("es-AR", { style: "currency", currency: moneda || "ARS" }).format(monto);
}

export default function FacturasPage() {
  const { session, isModOrAdmin, isAdmin } = useSession();
  const [facturas, setFacturas] = useState<Factura[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Form
  const [form, setForm] = useState({
    concepto: "", numero: "", monto: "", moneda: "ARS",
    fechaEmision: "", notas: "",
  });

  const fetchFacturas = async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("buscar", search);
    if (filtroEstado) params.set("estado", filtroEstado);
    const res = await fetch(`/api/facturas?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setFacturas(data.facturas || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchFacturas(); }, [search, filtroEstado]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.concepto) { setError("Archivo y concepto son requeridos"); return; }

    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("concepto", form.concepto);
    if (form.numero) fd.append("numero", form.numero);
    if (form.monto) fd.append("monto", form.monto);
    if (form.moneda) fd.append("moneda", form.moneda);
    if (form.fechaEmision) fd.append("fechaEmision", form.fechaEmision);
    if (form.notas) fd.append("notas", form.notas);

    const res = await fetch("/api/facturas", { method: "POST", credentials: "include", body: fd });
    if (res.ok) {
      setShowModal(false);
      setForm({ concepto: "", numero: "", monto: "", moneda: "ARS", fechaEmision: "", notas: "" });
      if (fileRef.current) fileRef.current.value = "";
      fetchFacturas();
    } else {
      const data = await res.json();
      setError(data.error || "Error al subir");
    }
    setUploading(false);
  };

  const cambiarEstado = async (id: string, estado: string) => {
    await fetch(`/api/facturas/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ estado }),
    });
    fetchFacturas();
  };

  const eliminar = async (id: string) => {
    if (!confirm("¿Eliminar esta factura?")) return;
    await fetch(`/api/facturas/${id}`, { method: "DELETE", credentials: "include" });
    fetchFacturas();
  };

  const descargar = (id: string) => {
    window.open(`/api/facturas/${id}`, "_blank");
  };

  void session;

  if (!isModOrAdmin) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">No tienes permisos para acceder a esta sección.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-5 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 tracking-tight">Facturas</h1>
          <p className="text-surface-400 text-xs mt-0.5">{facturas.length} registro{facturas.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar..."
            className="w-full sm:w-48 px-3 py-1.5 border border-surface-200 rounded-md text-xs bg-white focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
          />
          <select
            value={filtroEstado}
            onChange={(e) => setFiltroEstado(e.target.value)}
            className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600 bg-white"
          >
            <option value="">Todos</option>
            {ESTADOS.map((e) => <option key={e.clave} value={e.clave}>{e.label}</option>)}
          </select>
          <button
            onClick={() => { setShowModal(true); setError(null); }}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-surface-800 text-white hover:bg-surface-700 transition-colors whitespace-nowrap"
          >
            + Subir factura
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-5 h-5 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
            <span className="ml-3 text-xs text-surface-400">Cargando facturas...</span>
          </div>
        ) : facturas.length === 0 ? (
          <p className="text-sm text-surface-400 text-center py-12">
            {search || filtroEstado ? "Sin resultados" : "No hay facturas cargadas aún."}
          </p>
        ) : (
          <>
            {/* Mobile cards */}
            <div className="flex flex-col divide-y divide-surface-100 md:hidden">
              {facturas.map((f) => (
                <div key={f.id} className="p-3 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-surface-800 truncate">{f.concepto}</p>
                      {f.numero && <p className="text-[11px] text-surface-500">N° {f.numero}</p>}
                    </div>
                    <span className={estadoBadge(f.estado)}>
                      {ESTADOS.find((e) => e.clave === f.estado)?.label || f.estado}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-surface-500 flex-wrap">
                    <span className="font-medium text-surface-700">{formatMonto(f.monto, f.moneda)}</span>
                    <span>{formatDate(f.fechaEmision || f.createdAt)}</span>
                    <span className="text-surface-400">{f.subidoPor.nombre}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button onClick={() => descargar(f.id)} className="text-[11px] text-primary-600 hover:underline font-medium">Descargar</button>
                    {isAdmin && (
                      <>
                        <select
                          value={f.estado}
                          onChange={(e) => cambiarEstado(f.id, e.target.value)}
                          className="text-[11px] border border-surface-200 rounded px-1.5 py-0.5 bg-white text-surface-600"
                        >
                          {ESTADOS.map((e) => <option key={e.clave} value={e.clave}>{e.label}</option>)}
                        </select>
                        <button onClick={() => eliminar(f.id)} className="text-[11px] text-red-500 hover:underline">Eliminar</button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-[11px]">
                <thead className="border-b border-surface-200">
                  <tr>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Concepto</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">N°</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Monto</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Fecha</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Estado</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Archivo</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Subido por</th>
                    <th className="text-left px-3 py-2 uppercase text-[10px] tracking-wider text-surface-400 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-50">
                  {facturas.map((f, idx) => (
                    <tr key={f.id} className={`hover:bg-surface-50 ${idx % 2 ? "bg-surface-50/40" : ""}`}>
                      <td className="px-3 py-2 text-surface-800 font-medium max-w-[200px] truncate">{f.concepto}</td>
                      <td className="px-3 py-2 text-surface-600">{f.numero || "—"}</td>
                      <td className="px-3 py-2 text-surface-700 font-medium tabular-nums">{formatMonto(f.monto, f.moneda)}</td>
                      <td className="px-3 py-2 text-surface-600 tabular-nums">{formatDate(f.fechaEmision || f.createdAt)}</td>
                      <td className="px-3 py-2">
                        {isAdmin ? (
                          <select
                            value={f.estado}
                            onChange={(e) => cambiarEstado(f.id, e.target.value)}
                            className={`${estadoBadge(f.estado)} cursor-pointer border-0 bg-transparent focus:ring-0 p-0`}
                          >
                            {ESTADOS.map((e) => <option key={e.clave} value={e.clave}>{e.label}</option>)}
                          </select>
                        ) : (
                          <span className={estadoBadge(f.estado)}>
                            {ESTADOS.find((e) => e.clave === f.estado)?.label || f.estado}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-surface-500">
                        <span className="truncate block max-w-[120px]" title={f.archivoNombre}>{f.archivoNombre}</span>
                        <span className="text-surface-300 text-[10px]">{formatSize(f.archivoSize)}</span>
                      </td>
                      <td className="px-3 py-2 text-surface-600">{f.subidoPor.nombre}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <button onClick={() => descargar(f.id)} className="text-primary-600 hover:text-primary-700 hover:underline font-medium">
                            Descargar
                          </button>
                          {isAdmin && (
                            <button onClick={() => eliminar(f.id)} className="text-red-500 hover:text-red-600 hover:underline">
                              Eliminar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* Modal subir factura */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form onSubmit={handleUpload} className="bg-white rounded-xl shadow-xl p-5 w-full max-w-md animate-fade-in-up max-h-[90vh] overflow-y-auto">
            <h2 className="text-sm font-semibold text-surface-800 mb-4">Subir factura</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-[11px] text-surface-500 mb-1">Archivo *</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp,.xlsx,.xls"
                  required
                  className="w-full text-xs file:mr-2 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-medium file:bg-surface-100 file:text-surface-700 hover:file:bg-surface-200 file:cursor-pointer"
                />
                <p className="text-[10px] text-surface-400 mt-0.5">PDF, imágenes o Excel. Máx 15MB.</p>
              </div>

              <div>
                <label className="block text-[11px] text-surface-500 mb-1">Concepto *</label>
                <input
                  required
                  value={form.concepto}
                  onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                  placeholder="Ej: Servicio de instalación red Predio X"
                  className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-surface-500 mb-1">N° Factura</label>
                  <input
                    value={form.numero}
                    onChange={(e) => setForm({ ...form, numero: e.target.value })}
                    placeholder="0001-00001234"
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-500 mb-1">Fecha emisión</label>
                  <input
                    type="date"
                    value={form.fechaEmision}
                    onChange={(e) => setForm({ ...form, fechaEmision: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 text-surface-600"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] text-surface-500 mb-1">Monto</label>
                  <input
                    type="number"
                    step="0.01"
                    value={form.monto}
                    onChange={(e) => setForm({ ...form, monto: e.target.value })}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-surface-500 mb-1">Moneda</label>
                  <select
                    value={form.moneda}
                    onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600"
                  >
                    <option value="ARS">ARS</option>
                    <option value="USD">USD</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-[11px] text-surface-500 mb-1">Notas</label>
                <textarea
                  value={form.notas}
                  onChange={(e) => setForm({ ...form, notas: e.target.value })}
                  placeholder="Observaciones adicionales..."
                  rows={2}
                  className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none placeholder:text-surface-300"
                />
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-600 bg-red-50 rounded-lg p-2 mt-3">{error}</p>
            )}

            <div className="flex justify-end gap-2 mt-4">
              <button type="button" onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">
                Cancelar
              </button>
              <button type="submit" disabled={uploading} className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium transition-colors disabled:opacity-50">
                {uploading ? "Subiendo..." : "Subir"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
