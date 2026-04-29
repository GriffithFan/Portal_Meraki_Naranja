"use client";

import { useState } from "react";

interface EstadoOption {
  id: string;
  nombre: string;
}

interface EquipoOption {
  key: string;
  display: string;
}

interface CreateTareaModalProps {
  estados: EstadoOption[];
  equipoOpts: EquipoOption[];
  initialEstadoId?: string;
  initialEspacioId?: string;
  espacioNombre?: string;
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

const emptyForm = {
  nombre: "",
  direccion: "",
  ciudad: "",
  notas: "",
  prioridad: "MEDIA",
  incidencias: "",
  lacR: "",
  cue: "",
  ambito: "",
  equipoAsignado: "",
  provincia: "",
  cuePredio: "",
  gpsPredio: "",
  estadoId: "",
  espacioId: "",
};

export default function CreateTareaModal({
  estados,
  equipoOpts,
  initialEstadoId = "",
  initialEspacioId = "",
  espacioNombre,
  onClose,
  onCreated,
}: CreateTareaModalProps) {
  const [form, setForm] = useState({ ...emptyForm, estadoId: initialEstadoId, espacioId: initialEspacioId });
  const [creating, setCreating] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (creating) return;
    setCreating(true);
    const res = await fetch("/api/tareas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(form),
    });
    setCreating(false);
    if (res.ok) {
      onClose();
      void onCreated();
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <form onSubmit={handleCreate} className="bg-white rounded-xl shadow-xl p-5 w-full max-w-lg mx-4 animate-fade-in-up max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-sm font-semibold text-surface-800">Nueva tarea</h2>
            {espacioNombre && <p className="text-[11px] text-surface-400 mt-0.5">Se creara en {espacioNombre}</p>}
          </div>
          <button type="button" onClick={onClose} className="text-surface-300 hover:text-surface-500" title="Cerrar">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2.5">
          <input required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} placeholder="Nombre / Predio *" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
          <input value={form.incidencias} onChange={(e) => setForm({ ...form, incidencias: e.target.value })} placeholder="Incidencia" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />

          <div className="grid grid-cols-2 gap-2">
            <input value={form.cue} onChange={(e) => setForm({ ...form, cue: e.target.value })} placeholder="CUE" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
            <select value={form.lacR} onChange={(e) => setForm({ ...form, lacR: e.target.value })} className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
              <option value="">LAC-R</option>
              <option value="SI">SI</option>
              <option value="NO">NO</option>
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <select value={form.ambito} onChange={(e) => setForm({ ...form, ambito: e.target.value })} className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
              <option value="">Ambito</option>
              <option value="Urbano">Urbano</option>
              <option value="Rural">Rural</option>
            </select>
            <select value={form.equipoAsignado} onChange={(e) => setForm({ ...form, equipoAsignado: e.target.value })} className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
              <option value="">Equipo</option>
              {equipoOpts.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.key}{opt.display !== opt.key ? ` (${opt.display})` : ""}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <input value={form.provincia} onChange={(e) => setForm({ ...form, provincia: e.target.value })} placeholder="Provincia" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
            <input value={form.ciudad} onChange={(e) => setForm({ ...form, ciudad: e.target.value })} placeholder="Ciudad/Departamento" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
          </div>

          <input value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} placeholder="Direccion" className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />

          <div className="grid grid-cols-2 gap-2">
            <input value={form.cuePredio} onChange={(e) => setForm({ ...form, cuePredio: e.target.value })} placeholder="CUE_Predio" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
            <input value={form.gpsPredio} onChange={(e) => setForm({ ...form, gpsPredio: e.target.value })} placeholder="GPS_Predio" className="px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 placeholder:text-surface-300" />
          </div>

          <select value={form.estadoId} onChange={(e) => setForm({ ...form, estadoId: e.target.value })} className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs text-surface-600">
            <option value="">Estado inicial</option>
            {estados.map(e => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>

          <textarea value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} placeholder="Notas" rows={2} className="w-full px-2.5 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 resize-none placeholder:text-surface-300" />
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors">Cancelar</button>
          <button type="submit" disabled={creating} className="px-3 py-1.5 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 disabled:opacity-60 font-medium transition-colors">
            {creating ? "Creando..." : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}
