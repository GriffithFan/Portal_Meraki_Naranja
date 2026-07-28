"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { fetchJson, mensajeError } from "@/lib/fetchJson";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Tecnico { id: string; nombre: string; email: string; rol: string; salesforceUser: string | null }

const ROL_LABEL: Record<string, string> = { ADMIN: "Admin", MODERADOR: "Moderador", TECNICO: "Técnico" };

export default function SalesforceTecnicosPage() {
  const { loading: sessionLoading, isAdmin } = useSession();
  const [catalogo, setCatalogo] = useState<string[]>([]);
  const [tecnicos, setTecnicos] = useState<Tecnico[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    try {
      const d = await fetchJson<{ catalogo: string[]; tecnicos: Tecnico[] }>("/api/salesforce-tecnicos");
      setCatalogo(d.catalogo || []);
      setTecnicos(d.tecnicos || []);
    } catch (e) { toast.error(mensajeError(e, "No se pudo cargar")); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (isAdmin) cargar(); }, [isAdmin, cargar]);

  const asignar = async (userId: string, salesforceUser: string) => {
    setSavingId(userId);
    // Optimista
    const prev = tecnicos;
    setTecnicos((t) => t.map((x) => x.id === userId ? { ...x, salesforceUser: salesforceUser || null } : x));
    try {
      await fetchJson("/api/salesforce-tecnicos", {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, salesforceUser }),
      });
      toast.success("Guardado");
    } catch (e) {
      setTecnicos(prev); // revertir
      toast.error(mensajeError(e, "No se pudo guardar"));
    } finally { setSavingId(null); }
  };

  if (sessionLoading) return <div className="flex justify-center py-20"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>;
  if (!isAdmin) return <div className="py-20 text-center text-sm text-surface-400">Solo administradores.</div>;

  const usados = new Map(tecnicos.filter((t) => t.salesforceUser).map((t) => [t.salesforceUser as string, t.nombre]));

  return (
    <div className="mx-auto max-w-3xl animate-fade-in-up">
      <div className="mb-4">
        <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Usuarios de Salesforce</h1>
        <p className="text-xs text-surface-400 mt-0.5">Vinculá cada técnico con su usuario de Salesforce/Mined (THNET C0x). Se usa para <b>auto-lanzar</b> el predio cuando lo pasás a “EN PROGRESO”. Podés reasignar acá sin tocar la base.</p>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><div className="w-5 h-5 border-2 border-surface-200 border-t-surface-500 rounded-full animate-spin" /></div>
      ) : (
        <div className="rounded-xl border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 overflow-hidden">
          <div className="grid grid-cols-[1fr_200px] gap-2 px-4 py-2 border-b border-surface-100 dark:border-surface-700 bg-surface-50/60 dark:bg-surface-700/30 text-[11px] font-semibold uppercase tracking-wider text-surface-500">
            <span>Técnico</span><span>Usuario Salesforce</span>
          </div>
          <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
            {tecnicos.map((t) => (
              <div key={t.id} className="grid grid-cols-[1fr_200px] gap-2 items-center px-4 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-800 dark:text-surface-100 truncate">{t.nombre}
                    <span className="ml-2 text-[10px] font-normal text-surface-400">{ROL_LABEL[t.rol] || t.rol}</span>
                  </p>
                  <p className="text-[11px] text-surface-400 truncate">{t.email}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={t.salesforceUser || ""}
                    disabled={savingId === t.id}
                    onChange={(e) => asignar(t.id, e.target.value)}
                    className="w-full px-2 py-1.5 text-xs border border-surface-200 dark:border-surface-600 dark:bg-surface-700 rounded-md focus:outline-none focus:border-primary-400 disabled:opacity-50"
                  >
                    <option value="">— sin asignar —</option>
                    {catalogo.map((u) => {
                      const dueño = usados.get(u);
                      const ocupadoPorOtro = dueño && dueño !== t.nombre;
                      return <option key={u} value={u} disabled={!!ocupadoPorOtro}>{u}{ocupadoPorOtro ? ` (${dueño})` : ""}</option>;
                    })}
                  </select>
                  {savingId === t.id && <span className="w-3.5 h-3.5 border-2 border-surface-300 border-t-primary-500 rounded-full animate-spin shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <p className="text-[11px] text-surface-400 mt-3">Catálogo: {catalogo.length} usuarios (THNET C01–C020). Un usuario Salesforce solo puede estar en un técnico a la vez.</p>
    </div>
  );
}
