"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Permiso {
  seccion: string;
  rol: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

interface PermisoEstado {
  estadoId: string;
  rol: string;
  visible: boolean;
}

interface PermisoEstadoUsuario {
  estadoId: string;
  userId: string;
  visible: boolean;
}

interface PermisoSeccionUsuario {
  seccion: string;
  userId: string;
  ver: boolean;
  crear: boolean;
  editar: boolean;
  eliminar: boolean;
  exportar: boolean;
}

const CAMPOS = ["ver", "crear", "editar", "eliminar", "exportar"] as const;
type CampoPermiso = (typeof CAMPOS)[number];

const CAMPO_META: Record<CampoPermiso, { label: string; icon: string; desc: string }> = {
  ver:      { label: "Ver",      icon: "M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178zM15 12a3 3 0 11-6 0 3 3 0 016 0z", desc: "Acceder y visualizar" },
  crear:    { label: "Crear",    icon: "M12 4.5v15m7.5-7.5h-15", desc: "Crear nuevos registros" },
  editar:   { label: "Editar",   icon: "m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10", desc: "Modificar existentes" },
  eliminar: { label: "Eliminar", icon: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0", desc: "Borrar registros" },
  exportar: { label: "Exportar", icon: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3", desc: "Descargar datos" },
};

const SECCIONES = [
  { clave: "tareas",      label: "Tareas",       grupo: "Gestión",        icono: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" },
  { clave: "calendario",  label: "Calendario",   grupo: "Gestión",        icono: "M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" },
  { clave: "predios",     label: "Predios",      grupo: "Gestión",        icono: "M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" },
  { clave: "hospedajes",  label: "Hospedajes",   grupo: "Gestión",        icono: "M8.25 21v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21m0 0h4.5V3.545M12.75 21h7.5V10.75M2.25 21h1.5m18 0h-18M2.25 9l4.5-1.636M18.75 3l-1.5.545m0 6.205l3 1m1.5.5l-1.5-.5M6.75 7.364V3h-3v18m3-13.636l10.5-3.819" },
  { clave: "stock",       label: "Stock",        grupo: "Gestión",        icono: "M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" },
  { clave: "importar",    label: "Importar",     grupo: "Gestión",        icono: "M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" },
  { clave: "mapa",        label: "Mapa",         grupo: "Gestión",        icono: "M9 6.75V15m0-8.25a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V1.875c0-.621-.504-1.125-1.125-1.125H5.625c-.621 0-1.125.504-1.125 1.125v17.25" },
  { clave: "bandeja",     label: "Bandeja",      grupo: "Comunicación",   icono: "M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" },
  { clave: "actividad",   label: "Actividad",    grupo: "Comunicación",   icono: "M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" },
  { clave: "chat",        label: "Chat / Mesa",  grupo: "Comunicación",   icono: "M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" },
  { clave: "instructivo", label: "Instructivo",  grupo: "Recursos",       icono: "M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0018 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" },
  { clave: "actas",       label: "Actas",        grupo: "Recursos",       icono: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" },
  { clave: "facturacion", label: "Facturación",  grupo: "Recursos",       icono: "M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" },
  { clave: "kpis",        label: "KPIs",         grupo: "Administración", icono: "M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" },
  { clave: "usuarios",    label: "Usuarios",     grupo: "Administración", icono: "M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" },
  { clave: "permisos",    label: "Permisos",     grupo: "Administración", icono: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" },
  { clave: "auditoria",   label: "Auditoría",    grupo: "Administración", icono: "M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15a2.25 2.25 0 012.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM12 10.5h.008v.008H12V10.5zm0 3h.008v.008H12V13.5z" },
  { clave: "papelera",    label: "Papelera",     grupo: "Administración", icono: "m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" },
];

const ROLES_EDITABLES = ["MODERADOR", "TECNICO"] as const;

const ROL_STYLE: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  MODERADOR: { label: "Moderador", bg: "bg-amber-50 dark:bg-amber-900/20", text: "text-amber-700 dark:text-amber-300", border: "border-amber-200 dark:border-amber-700", dot: "bg-amber-500" },
  TECNICO:   { label: "Técnico",   bg: "bg-teal-50 dark:bg-teal-900/20",   text: "text-teal-700 dark:text-teal-300",   border: "border-teal-200 dark:border-teal-700",   dot: "bg-teal-500" },
};

function getDefaults(seccion: string, rol: string): Permiso {
  const base = { seccion, rol, ver: false, crear: false, editar: false, eliminar: false, exportar: false };
  if (rol === "MODERADOR") return { ...base, ver: true, crear: true, editar: true, eliminar: true, exportar: true };
  const verDefault = ["tareas", "calendario", "bandeja", "instructivo", "predios", "chat", "hospedajes", "actas"].includes(seccion);
  const editDefault = ["tareas", "calendario"].includes(seccion);
  return { ...base, ver: verDefault, crear: editDefault, editar: editDefault, eliminar: false, exportar: false };
}

export default function PermisosPage() {
  const { isAdmin } = useSession();
  const { puedeVer } = usePermisos();
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [tab, setTab] = useState<"secciones" | "estados" | "usuarios" | "seccionesUsuario">("secciones");

  const [estados, setEstados] = useState<any[]>([]);
  const [permisosEstado, setPermisosEstado] = useState<PermisoEstado[]>([]);
  const [dirtyEstados, setDirtyEstados] = useState(false);
  const [savingEstados, setSavingEstados] = useState(false);

  // Per-user estado visibility
  const [allUsers, setAllUsers] = useState<{ id: string; nombre: string; rol: string }[]>([]);
  const [tecnicos, setTecnicos] = useState<{ id: string; nombre: string }[]>([]);
  const [permisosUsuario, setPermisosUsuario] = useState<PermisoEstadoUsuario[]>([]);
  const [dirtyUsuarios, setDirtyUsuarios] = useState(false);
  const [savingUsuarios, setSavingUsuarios] = useState(false);
  const [selectedTecnico, setSelectedTecnico] = useState<string>("");

  // Per-user section permissions
  const [permisosSeccionUsuario, setPermisosSeccionUsuario] = useState<PermisoSeccionUsuario[]>([]);
  const [dirtySeccionUsuario, setDirtySeccionUsuario] = useState(false);
  const [savingSeccionUsuario, setSavingSeccionUsuario] = useState(false);
  const [selectedUserSeccion, setSelectedUserSeccion] = useState<string>("");

  const fetchPermisos = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/permisos", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setPermisos(data.permisos || []);
      setPermisosSeccionUsuario(data.permisosSeccionUsuario || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => { fetchPermisos(); }, [fetchPermisos]);

  useEffect(() => {
    if (!isAdmin) return;
    Promise.all([
      fetch("/api/estados", { credentials: "include" }).then(r => r.ok ? r.json() : { estados: [] }),
      fetch("/api/permisos/estados", { credentials: "include" }).then(r => r.ok ? r.json() : { permisos: [], permisosUsuario: [] }),
      fetch("/api/usuarios", { credentials: "include" }).then(r => r.ok ? r.json() : []),
    ]).then(([estData, permData, usersData]) => {
      setEstados(estData.estados || []);
      setPermisosEstado(permData.permisos || []);
      setPermisosUsuario(permData.permisosUsuario || []);
      const usersList = (usersData as any[]).filter((u: any) => u.rol !== "ADMIN").map((u: any) => ({ id: u.id, nombre: u.nombre, rol: u.rol }));
      setAllUsers(usersList);
      const tecList = usersList.filter((u) => u.rol === "TECNICO").map((u) => ({ id: u.id, nombre: u.nombre }));
      setTecnicos(tecList);
      if (tecList.length > 0) setSelectedTecnico(tecList[0].id);
      if (usersList.length > 0) setSelectedUserSeccion(usersList[0].id);
    });
  }, [isAdmin]);

  const getPermiso = (seccion: string, rol: string): Permiso => {
    const found = permisos.find((p) => p.seccion === seccion && p.rol === rol);
    if (found) return { ...getDefaults(seccion, rol), ...found };
    return getDefaults(seccion, rol);
  };

  const togglePermiso = (seccion: string, rol: string, campo: CampoPermiso) => {
    setDirty(true);
    setPermisos((prev) => {
      const current = getPermiso(seccion, rol);
      const updated = { ...current };
      if (campo === "ver") {
        updated.ver = !updated.ver;
        if (!updated.ver) { updated.crear = false; updated.editar = false; updated.eliminar = false; updated.exportar = false; }
      } else {
        (updated as any)[campo] = !(updated as any)[campo];
        if ((updated as any)[campo]) updated.ver = true;
      }
      const idx = prev.findIndex((p) => p.seccion === seccion && p.rol === rol);
      if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
      return [...prev, updated];
    });
  };

  const toggleAllForRole = (rol: string, value: boolean) => {
    setDirty(true);
    setPermisos((prev) => {
      const map = new Map(prev.map((p) => [`${p.seccion}-${p.rol}`, p]));
      for (const sec of SECCIONES) {
        map.set(`${sec.clave}-${rol}`, { seccion: sec.clave, rol, ver: value, crear: value, editar: value, eliminar: value, exportar: value });
      }
      return Array.from(map.values());
    });
  };

  const toggleAllForSeccion = (seccion: string, value: boolean) => {
    setDirty(true);
    setPermisos((prev) => {
      const map = new Map(prev.map((p) => [`${p.seccion}-${p.rol}`, p]));
      for (const rol of ROLES_EDITABLES) {
        map.set(`${seccion}-${rol}`, { seccion, rol, ver: value, crear: value, editar: value, eliminar: value, exportar: value });
      }
      return Array.from(map.values());
    });
  };

  const guardar = async () => {
    setSaving(true);
    const payload = SECCIONES.flatMap((s) =>
      ROLES_EDITABLES.map((rol) => {
        const p = getPermiso(s.clave, rol);
        return { seccion: s.clave, rol, ver: p.ver, crear: p.crear, editar: p.editar, eliminar: p.eliminar, exportar: p.exportar };
      })
    );
    const res = await fetch("/api/permisos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permisos: payload }),
    });
    if (res.ok) {
      const data = await res.json();
      setPermisos(data.permisos || []);
      setDirty(false);
      setToast("Permisos guardados correctamente");
      setTimeout(() => setToast(null), 3000);
    }
    setSaving(false);
  };

  const getPermisoEstado = (estadoId: string, rol: string): boolean => {
    const found = permisosEstado.find((p) => p.estadoId === estadoId && p.rol === rol);
    return found ? found.visible : true;
  };

  const togglePermisoEstado = (estadoId: string, rol: string) => {
    setDirtyEstados(true);
    setPermisosEstado((prev) => {
      const idx = prev.findIndex((p) => p.estadoId === estadoId && p.rol === rol);
      const current = getPermisoEstado(estadoId, rol);
      const updated: PermisoEstado = { estadoId, rol, visible: !current };
      if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
      return [...prev, updated];
    });
  };

  const guardarEstados = async () => {
    setSavingEstados(true);
    const payload = estados.flatMap((e: any) =>
      ROLES_EDITABLES.map((rol) => ({ estadoId: e.id, rol, visible: getPermisoEstado(e.id, rol) }))
    );
    const res = await fetch("/api/permisos/estados", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permisos: payload }),
    });
    if (res.ok) {
      setDirtyEstados(false);
      setToast("Visibilidad de estados guardada");
      setTimeout(() => setToast(null), 3000);
    }
    setSavingEstados(false);
  };

  // ── Per-user estado helpers ──
  const getPermisoUsuario = (estadoId: string, userId: string): boolean => {
    const found = permisosUsuario.find((p) => p.estadoId === estadoId && p.userId === userId);
    return found ? found.visible : true;
  };

  const togglePermisoUsuario = (estadoId: string, userId: string) => {
    setDirtyUsuarios(true);
    setPermisosUsuario((prev) => {
      const idx = prev.findIndex((p) => p.estadoId === estadoId && p.userId === userId);
      const current = getPermisoUsuario(estadoId, userId);
      const updated: PermisoEstadoUsuario = { estadoId, userId, visible: !current };
      if (idx >= 0) { const copy = [...prev]; copy[idx] = updated; return copy; }
      return [...prev, updated];
    });
  };

  const guardarEstadosUsuario = async () => {
    setSavingUsuarios(true);
    const payload = tecnicos.flatMap((tec) =>
      estados.map((e: any) => ({ estadoId: e.id, userId: tec.id, visible: getPermisoUsuario(e.id, tec.id) }))
    );
    const res = await fetch("/api/permisos/estados", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permisosUsuario: payload }),
    });
    if (res.ok) {
      const data = await res.json();
      setPermisosUsuario(data.permisosUsuario || []);
      setDirtyUsuarios(false);
      setToast("Visibilidad por usuario guardada");
      setTimeout(() => setToast(null), 3000);
    }
    setSavingUsuarios(false);
  };

  // ── Per-user section permission helpers ──
  const getPermisoSeccionUsuario = (seccion: string, userId: string, campo: CampoPermiso): boolean => {
    const found = permisosSeccionUsuario.find((p) => p.seccion === seccion && p.userId === userId);
    if (!found) {
      // Default: use role defaults
      const user = allUsers.find((u) => u.id === userId);
      if (!user) return false;
      return getDefaults(seccion, user.rol)[campo] as boolean;
    }
    return (found as any)[campo] as boolean;
  };

  const togglePermisoSeccionUsuario = (seccion: string, userId: string, campo: CampoPermiso) => {
    setDirtySeccionUsuario(true);
    setPermisosSeccionUsuario((prev) => {
      const idx = prev.findIndex((p) => p.seccion === seccion && p.userId === userId);
      const current = getPermisoSeccionUsuario(seccion, userId, campo);
      if (idx >= 0) {
        const copy = [...prev];
        const updated = { ...copy[idx] };
        if (campo === "ver") {
          updated.ver = !current;
          if (!updated.ver) { updated.crear = false; updated.editar = false; updated.eliminar = false; updated.exportar = false; }
        } else {
          (updated as any)[campo] = !current;
          if (!current) updated.ver = true;
        }
        copy[idx] = updated;
        return copy;
      }
      // Create new entry with defaults
      const user = allUsers.find((u) => u.id === userId);
      const defaults = getDefaults(seccion, user?.rol || "TECNICO");
      const newEntry: PermisoSeccionUsuario = {
        seccion, userId,
        ver: defaults.ver, crear: defaults.crear, editar: defaults.editar, eliminar: defaults.eliminar, exportar: defaults.exportar,
      };
      if (campo === "ver") {
        newEntry.ver = !current;
        if (!newEntry.ver) { newEntry.crear = false; newEntry.editar = false; newEntry.eliminar = false; newEntry.exportar = false; }
      } else {
        (newEntry as any)[campo] = !current;
        if ((newEntry as any)[campo]) newEntry.ver = true;
      }
      return [...prev, newEntry];
    });
  };

  const toggleAllSeccionUsuario = (userId: string, value: boolean) => {
    setDirtySeccionUsuario(true);
    setPermisosSeccionUsuario((prev) => {
      const map = new Map(prev.map((p) => [`${p.seccion}-${p.userId}`, p]));
      for (const sec of SECCIONES) {
        map.set(`${sec.clave}-${userId}`, { seccion: sec.clave, userId, ver: value, crear: value, editar: value, eliminar: value, exportar: value });
      }
      return Array.from(map.values());
    });
  };

  const guardarSeccionUsuario = async () => {
    setSavingSeccionUsuario(true);
    // Send only entries for the selected user to avoid huge payloads
    const payload = SECCIONES.map((s) => ({
      seccion: s.clave,
      userId: selectedUserSeccion,
      ver: getPermisoSeccionUsuario(s.clave, selectedUserSeccion, "ver"),
      crear: getPermisoSeccionUsuario(s.clave, selectedUserSeccion, "crear"),
      editar: getPermisoSeccionUsuario(s.clave, selectedUserSeccion, "editar"),
      eliminar: getPermisoSeccionUsuario(s.clave, selectedUserSeccion, "eliminar"),
      exportar: getPermisoSeccionUsuario(s.clave, selectedUserSeccion, "exportar"),
    }));
    const res = await fetch("/api/permisos", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ permisosSeccionUsuario: payload }),
    });
    if (res.ok) {
      const data = await res.json();
      setPermisosSeccionUsuario(data.permisosSeccionUsuario || []);
      setDirtySeccionUsuario(false);
      setToast("Permisos por usuario guardados");
      setTimeout(() => setToast(null), 3000);
    }
    setSavingSeccionUsuario(false);
  };

  if (!isAdmin || !puedeVer("permisos")) {
    return (
      <div className="animate-fade-in-up flex items-center justify-center py-20">
        <p className="text-sm text-surface-400">Solo administradores pueden gestionar permisos.</p>
      </div>
    );
  }

  const gruposOrden = ["Gestión", "Comunicación", "Recursos", "Administración"];
  const grupos = gruposOrden.filter((g) => SECCIONES.some((s) => s.grupo === g));

  const countActive = (rol: string) => {
    let total = 0;
    for (const sec of SECCIONES) {
      const p = getPermiso(sec.clave, rol);
      for (const c of CAMPOS) if ((p as any)[c]) total++;
    }
    return total;
  };

  return (
    <div className="animate-fade-in-up max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-bold text-surface-800 dark:text-surface-100 tracking-tight flex items-center gap-2">
            <svg className="w-5 h-5 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
            </svg>
            Permisos
          </h1>
          <p className="text-surface-400 dark:text-surface-500 text-xs mt-0.5">
            Controlá qué puede hacer cada rol. Admin siempre tiene acceso total.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {ROLES_EDITABLES.map((rol) => {
            const rs = ROL_STYLE[rol];
            const active = countActive(rol);
            const total = SECCIONES.length * CAMPOS.length;
            return (
              <div key={rol} className={clsx("px-2.5 py-1 rounded-lg border text-[10px] font-medium", rs.bg, rs.border, rs.text)}>
                <span className={clsx("inline-block w-1.5 h-1.5 rounded-full mr-1 align-middle", rs.dot)} />
                {rs.label}: {active}/{total}
              </div>
            );
          })}
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="mb-4 px-3 py-2 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 text-xs rounded-lg border border-emerald-200 dark:border-emerald-700 animate-fade-in-up flex items-center gap-2">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          {toast}
        </div>
      )}

      {/* Tabs + Save */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <div className="flex bg-surface-100 dark:bg-surface-700 rounded-lg p-0.5 flex-wrap">
          <button
            onClick={() => setTab("secciones")}
            className={clsx(
              "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
              tab === "secciones"
                ? "bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-sm"
                : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
            )}
          >
            Secciones
          </button>
          <button
            onClick={() => setTab("seccionesUsuario")}
            className={clsx(
              "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
              tab === "seccionesUsuario"
                ? "bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-sm"
                : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
            )}
          >
            Secciones × Usuario
          </button>
          {estados.length > 0 && (
            <>
            <button
              onClick={() => setTab("estados")}
              className={clsx(
                "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
                tab === "estados"
                  ? "bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-sm"
                  : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
              )}
            >
              Estados
            </button>
            <button
              onClick={() => setTab("usuarios")}
              className={clsx(
                "px-4 py-1.5 rounded-md text-xs font-medium transition-all",
                tab === "usuarios"
                  ? "bg-white dark:bg-surface-800 text-surface-800 dark:text-surface-100 shadow-sm"
                  : "text-surface-500 dark:text-surface-400 hover:text-surface-700 dark:hover:text-surface-200"
              )}
            >
              Estados × Usuario
            </button>
            </>
          )}
        </div>
        <button
          onClick={tab === "estados" ? guardarEstados : tab === "usuarios" ? guardarEstadosUsuario : tab === "seccionesUsuario" ? guardarSeccionUsuario : guardar}
          disabled={
            tab === "estados" ? !dirtyEstados || savingEstados :
            tab === "usuarios" ? !dirtyUsuarios || savingUsuarios :
            tab === "seccionesUsuario" ? !dirtySeccionUsuario || savingSeccionUsuario :
            !dirty || saving
          }
          className={clsx(
            "px-4 py-1.5 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5",
            (tab === "estados" ? dirtyEstados : tab === "usuarios" ? dirtyUsuarios : tab === "seccionesUsuario" ? dirtySeccionUsuario : dirty)
              ? "bg-blue-600 text-white hover:bg-blue-700 shadow-sm"
              : "bg-surface-200 dark:bg-surface-700 text-surface-400 cursor-not-allowed"
          )}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          {(tab === "estados" ? savingEstados : tab === "usuarios" ? savingUsuarios : tab === "seccionesUsuario" ? savingSeccionUsuario : saving) ? "Guardando..." : "Guardar"}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : tab === "secciones" ? (
        <div className="space-y-6">
          {grupos.map((grupo) => (
            <div key={grupo}>
              <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-2 px-1">{grupo}</h3>
              <div className="space-y-2">
                {SECCIONES.filter((s) => s.grupo === grupo).map((sec) => (
                  <div key={sec.clave} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                    {/* Section header */}
                    <div className="flex items-center justify-between px-4 py-2.5 border-b border-surface-100 dark:border-surface-700/50">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center">
                          <svg className="w-4 h-4 text-surface-500 dark:text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d={sec.icono} />
                          </svg>
                        </div>
                        <span className="text-sm font-semibold text-surface-800 dark:text-surface-100">{sec.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button onClick={() => toggleAllForSeccion(sec.clave, true)} className="px-2 py-0.5 rounded text-[9px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition">Todo</button>
                        <button onClick={() => toggleAllForSeccion(sec.clave, false)} className="px-2 py-0.5 rounded text-[9px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition">Nada</button>
                      </div>
                    </div>

                    {/* Role rows */}
                    <div className="divide-y divide-surface-50 dark:divide-surface-700/30">
                      {ROLES_EDITABLES.map((rol) => {
                        const rs = ROL_STYLE[rol];
                        const p = getPermiso(sec.clave, rol);
                        return (
                          <div key={rol} className="flex items-center gap-3 px-4 py-2.5">
                            <div className="w-24 flex-shrink-0">
                              <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border", rs.bg, rs.text, rs.border)}>
                                <span className={clsx("w-1.5 h-1.5 rounded-full", rs.dot)} />
                                {rs.label}
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap flex-1">
                              {CAMPOS.map((campo) => {
                                const active = (p as any)[campo] as boolean;
                                const meta = CAMPO_META[campo];
                                return (
                                  <button
                                    key={campo}
                                    onClick={() => togglePermiso(sec.clave, rol, campo)}
                                    title={meta.desc}
                                    className={clsx(
                                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                                      active
                                        ? campo === "eliminar"
                                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                                          : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                                        : "bg-surface-50 dark:bg-surface-700/50 text-surface-400 dark:text-surface-500 border-surface-200 dark:border-surface-600 hover:border-surface-300 dark:hover:border-surface-500"
                                    )}
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                                    </svg>
                                    {meta.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Footer actions */}
          <div className="flex items-center justify-between pt-2 pb-4 px-1">
            <p className="text-[10px] text-surface-400 dark:text-surface-500">
              Monitoreo (Topología, Switches, APs, Appliance) siempre visible para todos.
            </p>
            <div className="flex gap-3">
              {ROLES_EDITABLES.map((rol) => {
                const rs = ROL_STYLE[rol];
                return (
                  <div key={rol} className="flex items-center gap-1">
                    <span className={clsx("text-[10px] font-medium", rs.text)}>{rs.label}:</span>
                    <button onClick={() => toggleAllForRole(rol, true)} className="text-[9px] px-1.5 py-0.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 font-medium transition">Todo</button>
                    <button onClick={() => toggleAllForRole(rol, false)} className="text-[9px] px-1.5 py-0.5 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 font-medium transition">Nada</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : tab === "estados" ? (
        /* ── Tab: Estados ── */
        <div>
          <p className="text-xs text-surface-400 dark:text-surface-500 mb-4">
            Controla qué estados del cronograma puede ver cada rol en Tareas.
          </p>
          <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
            <div className="hidden md:block">
              <table className="w-full text-[11px]">
                <thead className="border-b border-surface-200 dark:border-surface-700 bg-surface-50/50 dark:bg-surface-800/80">
                  <tr>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-surface-400 dark:text-surface-500 font-medium">Estado</th>
                    {ROLES_EDITABLES.map((rol) => {
                      const rs = ROL_STYLE[rol];
                      return (
                        <th key={rol} className="text-center px-4 py-3">
                          <span className={clsx("inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10px] font-semibold border", rs.bg, rs.text, rs.border)}>
                            <span className={clsx("w-1.5 h-1.5 rounded-full", rs.dot)} />
                            {rs.label}
                          </span>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-surface-100 dark:divide-surface-700/50">
                  {estados.map((estado: any) => (
                    <tr key={estado.id} className="hover:bg-surface-50 dark:hover:bg-surface-700/50">
                      <td className="px-4 py-2.5">
                        <span className="inline-flex items-center gap-2 text-surface-700 dark:text-surface-300 font-medium">
                          <span className="w-3 h-3 rounded" style={{ backgroundColor: estado.color }} />
                          {estado.nombre}
                        </span>
                      </td>
                      {ROLES_EDITABLES.map((rol) => (
                        <td key={`${estado.id}-${rol}`} className="text-center px-4 py-2.5">
                          <button
                            onClick={() => togglePermisoEstado(estado.id, rol)}
                            className={clsx(
                              "w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center mx-auto",
                              getPermisoEstado(estado.id, rol)
                                ? "bg-blue-600 border-blue-600 text-white"
                                : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 hover:border-surface-400"
                            )}
                          >
                            {getPermisoEstado(estado.id, rol) && (
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            )}
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-0 md:hidden divide-y divide-surface-100 dark:divide-surface-700/50">
              {estados.map((estado: any) => (
                <div key={estado.id} className="p-3">
                  <p className="text-xs font-semibold text-surface-800 dark:text-surface-200 mb-2 flex items-center gap-2">
                    <span className="w-3 h-3 rounded" style={{ backgroundColor: estado.color }} />
                    {estado.nombre}
                  </p>
                  <div className="flex items-center gap-4">
                    {ROLES_EDITABLES.map((rol) => {
                      const rs = ROL_STYLE[rol];
                      return (
                        <button key={rol} onClick={() => togglePermisoEstado(estado.id, rol)} className="flex items-center gap-1.5">
                          <span className={clsx(
                            "w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
                            getPermisoEstado(estado.id, rol)
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600"
                          )}>
                            {getPermisoEstado(estado.id, rol) && (
                              <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                            )}
                          </span>
                          <span className={clsx("text-[10px] font-semibold", rs.text)}>{rs.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-3 px-1">
            Los estados desmarcados no serán visibles para ese rol en el Cronograma. Admin siempre ve todos.
          </p>
        </div>
      ) : tab === "usuarios" ? (
        /* ── Tab: Por usuario ── */
        <div>
          <p className="text-xs text-surface-400 dark:text-surface-500 mb-4">
            Controla qué estados puede ver cada técnico individualmente. Tiene prioridad sobre los permisos por rol.
          </p>

          {tecnicos.length === 0 ? (
            <p className="text-xs text-surface-400 py-8 text-center">No hay técnicos registrados.</p>
          ) : (
            <>
              {/* Selector de técnico */}
              <div className="flex items-center gap-3 mb-4">
                <label className="text-xs font-medium text-surface-600 dark:text-surface-300">Técnico:</label>
                <select
                  value={selectedTecnico}
                  onChange={(e) => setSelectedTecnico(e.target.value)}
                  className="text-xs border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {tecnicos.map((tec) => (
                    <option key={tec.id} value={tec.id}>{tec.nombre}</option>
                  ))}
                </select>
              </div>

              {/* Grilla estados para el técnico seleccionado */}
              <div className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
                <div className="divide-y divide-surface-100 dark:divide-surface-700/50">
                  {estados.map((estado: any) => {
                    const visible = getPermisoUsuario(estado.id, selectedTecnico);
                    return (
                      <div key={estado.id} className="flex items-center justify-between px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-700/50">
                        <span className="inline-flex items-center gap-2 text-xs text-surface-700 dark:text-surface-300 font-medium">
                          <span className="w-3 h-3 rounded" style={{ backgroundColor: estado.color }} />
                          {estado.nombre}
                        </span>
                        <button
                          onClick={() => togglePermisoUsuario(estado.id, selectedTecnico)}
                          className={clsx(
                            "w-5 h-5 rounded-md border-2 transition-all flex items-center justify-center",
                            visible
                              ? "bg-blue-600 border-blue-600 text-white"
                              : "bg-white dark:bg-surface-700 border-surface-300 dark:border-surface-600 hover:border-surface-400"
                          )}
                        >
                          {visible && (
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-3 px-1">
                Los estados desmarcados quedan ocultos para este técnico. Admin y moderadores siempre ven todos.
              </p>
            </>
          )}
        </div>
      ) : tab === "seccionesUsuario" ? (
        /* ── Tab: Secciones × Usuario ── */
        <div>
          <p className="text-xs text-surface-400 dark:text-surface-500 mb-4">
            Controla permisos de cada sección por usuario individual. Tiene prioridad sobre los permisos por rol.
          </p>

          {allUsers.length === 0 ? (
            <p className="text-xs text-surface-400 py-8 text-center">No hay usuarios registrados.</p>
          ) : (
            <>
              {/* Selector de usuario */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <label className="text-xs font-medium text-surface-600 dark:text-surface-300">Usuario:</label>
                <select
                  value={selectedUserSeccion}
                  onChange={(e) => setSelectedUserSeccion(e.target.value)}
                  className="text-xs border border-surface-200 dark:border-surface-600 bg-white dark:bg-surface-700 text-surface-800 dark:text-surface-100 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-primary-500 outline-none"
                >
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>{u.nombre} ({u.rol})</option>
                  ))}
                </select>
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => toggleAllSeccionUsuario(selectedUserSeccion, true)} className="px-2 py-0.5 rounded text-[9px] font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition">Todo</button>
                  <button onClick={() => toggleAllSeccionUsuario(selectedUserSeccion, false)} className="px-2 py-0.5 rounded text-[9px] font-medium text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition">Nada</button>
                </div>
              </div>

              {/* Secciones del usuario seleccionado */}
              <div className="space-y-2">
                {grupos.map((grupo) => (
                  <div key={grupo}>
                    <h3 className="text-[11px] font-semibold uppercase tracking-wider text-surface-400 dark:text-surface-500 mb-2 px-1">{grupo}</h3>
                    <div className="space-y-1.5">
                      {SECCIONES.filter((s) => s.grupo === grupo).map((sec) => (
                        <div key={sec.clave} className="bg-white dark:bg-surface-800 rounded-xl border border-surface-200 dark:border-surface-700 px-4 py-2.5">
                          <div className="flex items-center gap-3">
                            <div className="w-7 h-7 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0">
                              <svg className="w-4 h-4 text-surface-500 dark:text-surface-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                <path strokeLinecap="round" strokeLinejoin="round" d={sec.icono} />
                              </svg>
                            </div>
                            <span className="text-sm font-semibold text-surface-800 dark:text-surface-100 w-28 shrink-0">{sec.label}</span>
                            <div className="flex items-center gap-1.5 flex-wrap flex-1">
                              {CAMPOS.map((campo) => {
                                const active = getPermisoSeccionUsuario(sec.clave, selectedUserSeccion, campo);
                                const meta = CAMPO_META[campo];
                                return (
                                  <button
                                    key={campo}
                                    onClick={() => togglePermisoSeccionUsuario(sec.clave, selectedUserSeccion, campo)}
                                    title={meta.desc}
                                    className={clsx(
                                      "inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-medium border transition-all",
                                      active
                                        ? campo === "eliminar"
                                          ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border-red-200 dark:border-red-800"
                                          : "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400 border-blue-200 dark:border-blue-800"
                                        : "bg-surface-50 dark:bg-surface-700/50 text-surface-400 dark:text-surface-500 border-surface-200 dark:border-surface-600 hover:border-surface-300 dark:hover:border-surface-500"
                                    )}
                                  >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d={meta.icon} />
                                    </svg>
                                    {meta.label}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-surface-400 dark:text-surface-500 mt-3 px-1">
                Los permisos individuales tienen prioridad sobre los permisos por rol. Admin siempre tiene acceso total.
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
