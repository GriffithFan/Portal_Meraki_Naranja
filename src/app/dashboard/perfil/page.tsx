"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ROL_LABELS: Record<string, string> = {
  ADMIN: "Administrador",
  MODERADOR: "Moderador",
  TECNICO: "Técnico",
};

const ROL_COLORS: Record<string, string> = {
  ADMIN: "bg-red-50 text-red-700 border-red-200",
  MODERADOR: "bg-amber-50 text-amber-700 border-amber-200",
  TECNICO: "bg-teal-50 text-teal-700 border-teal-200",
};

const AVATAR_GRADIENTS = [
  { id: "default", from: "from-primary-500", to: "to-accent-500", label: "Índigo/Violeta" },
  { id: "ocean", from: "from-cyan-500", to: "to-blue-600", label: "Océano" },
  { id: "sunset", from: "from-orange-400", to: "to-rose-500", label: "Atardecer" },
  { id: "forest", from: "from-emerald-500", to: "to-teal-600", label: "Bosque" },
  { id: "berry", from: "from-fuchsia-500", to: "to-pink-600", label: "Berry" },
  { id: "slate", from: "from-slate-500", to: "to-slate-700", label: "Pizarra" },
  { id: "amber", from: "from-amber-400", to: "to-orange-600", label: "Ámbar" },
  { id: "mint", from: "from-green-400", to: "to-emerald-600", label: "Menta" },
];

const PREFS_KEY = "pmn-perfil-prefs";

export default function PerfilPage() {
  useSession(); // ensure authenticated
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [form, setForm] = useState({ nombre: "", telefono: "" });

  // Personalización local
  const [avatarGradient, setAvatarGradient] = useState("default");
  const [compactView, setCompactView] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(PREFS_KEY);
      if (saved) {
        const p = JSON.parse(saved);
        if (p.avatarGradient) setAvatarGradient(p.avatarGradient);
        if (p.compactView) setCompactView(p.compactView);
      }
    } catch { /* ignore */ }
  }, []);

  function savePrefs(updates: Record<string, any>) {
    const next = { avatarGradient, compactView, ...updates };
    localStorage.setItem(PREFS_KEY, JSON.stringify(next));
    if (updates.avatarGradient !== undefined) setAvatarGradient(updates.avatarGradient);
    if (updates.compactView !== undefined) setCompactView(updates.compactView);
    setToast("Preferencia guardada");
    setTimeout(() => setToast(null), 2000);
  }

  const gradient = AVATAR_GRADIENTS.find(g => g.id === avatarGradient) || AVATAR_GRADIENTS[0];

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/profile", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.user);
        setForm({ nombre: data.user.nombre || "", telefono: data.user.telefono || "" });
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProfile(); }, [fetchProfile]);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/auth/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile((prev: any) => ({ ...prev, ...data.user }));
        setEditing(false);
        setToast("Perfil actualizado");
        setTimeout(() => setToast(null), 3000);
      }
    } catch { /* ignore */ }
    setSaving(false);
  }

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

  if (loading) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" />
        <span className="ml-3 text-xs text-surface-400">Cargando perfil...</span>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">No se pudo cargar el perfil.</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in-up max-w-2xl mx-auto">
      <h1 className="text-xl font-semibold text-surface-800 tracking-tight mb-5">Mi perfil</h1>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-3 py-2 bg-emerald-50 text-emerald-700 text-xs rounded-lg border border-emerald-200 animate-fade-in-up">
          {toast}
        </div>
      )}

      {/* Card principal */}
      <div className="bg-white border border-surface-200 rounded-lg overflow-hidden">
        {/* Header con gradiente */}
        <div className={`h-20 bg-gradient-to-r ${gradient.from} ${gradient.to} relative`}>
          <div className="absolute -bottom-8 left-5">
            <div className={`w-16 h-16 rounded-full bg-gradient-to-br ${gradient.from} ${gradient.to} flex items-center justify-center text-white text-2xl font-bold shadow-lg border-4 border-white`}>
              {(profile.nombre?.[0] || "U").toUpperCase()}
            </div>
          </div>
        </div>

        <div className="pt-12 px-5 pb-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-surface-800">{profile.nombre}</h2>
              <p className="text-sm text-surface-500">{profile.email}</p>
            </div>
            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border ${ROL_COLORS[profile.rol] || "bg-surface-50 text-surface-600 border-surface-200"}`}>
              {ROL_LABELS[profile.rol] || profile.rol}
            </span>
          </div>

          {/* Info */}
          <div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Nombre</label>
                {editing ? (
                  <input
                    type="text"
                    value={form.nombre}
                    onChange={(e) => setForm(f => ({ ...f, nombre: e.target.value }))}
                    className="mt-1 w-full px-3 py-1.5 border border-surface-300 rounded-md text-sm focus:outline-none focus:border-primary-400 transition-colors"
                  />
                ) : (
                  <p className="text-sm text-surface-700 mt-0.5">{profile.nombre}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Email</label>
                <p className="text-sm text-surface-700 mt-0.5">{profile.email}</p>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Teléfono</label>
                {editing ? (
                  <input
                    type="tel"
                    value={form.telefono}
                    onChange={(e) => setForm(f => ({ ...f, telefono: e.target.value }))}
                    placeholder="Ej: +54 11 1234-5678"
                    className="mt-1 w-full px-3 py-1.5 border border-surface-300 rounded-md text-sm focus:outline-none focus:border-primary-400 transition-colors"
                  />
                ) : (
                  <p className="text-sm text-surface-700 mt-0.5">{profile.telefono || "No configurado"}</p>
                )}
              </div>
              <div>
                <label className="text-[11px] font-medium text-surface-400 uppercase tracking-wider">Miembro desde</label>
                <p className="text-sm text-surface-700 mt-0.5">{formatDate(profile.createdAt)}</p>
              </div>
            </div>
          </div>

          {/* Estadísticas */}
          <div className="mt-5 pt-4 border-t border-surface-100 grid grid-cols-3 gap-3">
            <div className="text-center py-2 bg-surface-50 rounded-lg">
              <p className="text-lg font-semibold text-surface-800 tabular-nums">{profile._count?.asignaciones || 0}</p>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider">Asignaciones</p>
            </div>
            <div className="text-center py-2 bg-surface-50 rounded-lg">
              <p className="text-lg font-semibold text-surface-800 tabular-nums">{profile._count?.prediosCreados || 0}</p>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider">Predios creados</p>
            </div>
            <div className="text-center py-2 bg-surface-50 rounded-lg">
              <p className="text-lg font-semibold text-surface-800 tabular-nums">{profile._count?.comentarios || 0}</p>
              <p className="text-[10px] text-surface-400 uppercase tracking-wider">Comentarios</p>
            </div>
          </div>

          {/* Personalización */}
          <div className="mt-5 pt-4 border-t border-surface-100">
            <h3 className="text-[11px] font-semibold text-surface-500 uppercase tracking-wider mb-3">Personalización</h3>

            {/* Color de avatar */}
            <div className="mb-4">
              <p className="text-xs text-surface-600 mb-2">Color de avatar</p>
              <div className="flex flex-wrap gap-2">
                {AVATAR_GRADIENTS.map(g => (
                  <button
                    key={g.id}
                    onClick={() => savePrefs({ avatarGradient: g.id })}
                    className={`w-8 h-8 rounded-full bg-gradient-to-br ${g.from} ${g.to} transition-all ${
                      avatarGradient === g.id
                        ? "ring-2 ring-offset-2 ring-surface-400 scale-110"
                        : "hover:scale-105 opacity-70 hover:opacity-100"
                    }`}
                    title={g.label}
                  />
                ))}
              </div>
            </div>

            {/* Vista compacta */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={compactView}
                onChange={(e) => savePrefs({ compactView: e.target.checked })}
                className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-surface-600">Preferir vista compacta en tablas</span>
            </label>
          </div>

          {/* Acciones */}
          <div className="mt-4 flex items-center gap-2 justify-end">
            {editing ? (
              <>
                <button
                  onClick={() => { setEditing(false); setForm({ nombre: profile.nombre, telefono: profile.telefono || "" }); }}
                  className="px-3 py-1.5 text-xs text-surface-600 hover:bg-surface-100 rounded-md transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving || !form.nombre.trim()}
                  className="px-4 py-1.5 text-xs font-medium bg-surface-800 text-white rounded-md hover:bg-surface-700 transition-colors disabled:opacity-40"
                >
                  {saving ? "Guardando..." : "Guardar"}
                </button>
              </>
            ) : (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-1.5 text-xs font-medium bg-surface-800 text-white rounded-md hover:bg-surface-700 transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                </svg>
                Editar perfil
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
