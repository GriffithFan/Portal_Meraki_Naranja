"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "@/hooks/useSession";

/* eslint-disable @typescript-eslint/no-explicit-any */

// ─── Iconos ────────────────────────────────────────────
const ChevronIcon = ({ open }: { open: boolean }) => (
  <svg className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-90" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
  </svg>
);

const PlusIcon = () => (
  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

// DotsIcon reserved for future context menu

const ICON_MAP: Record<string, string> = {
  folder: "M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.061-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z",
  list: "M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z",
  map: "M9 6.75V15m0 0l3-3m-3 3l-3-3M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75",
  bolt: "M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z",
};

const EspacioIcon = ({ icono, color, size = 16 }: { icono: string; color: string; size?: number }) => (
  <svg width={size} height={size} fill="none" stroke={color} strokeWidth={1.7} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={ICON_MAP[icono] || ICON_MAP.folder} />
  </svg>
);

// ─── Colores predefinidos ──────────────────────────────
const PRESET_COLORS = [
  "#3b82f6", "#f97316", "#22c55e", "#ef4444", "#a855f7",
  "#06b6d4", "#eab308", "#ec4899", "#6366f1", "#14b8a6",
];

// ─── Modal crear espacio ───────────────────────────────
function CreateSpaceModal({
  parentId,
  parentName,
  onClose,
  onCreated,
}: {
  parentId: string | null;
  parentName: string | null;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [nombre, setNombre] = useState("");
  const [color, setColor] = useState("#3b82f6");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nombre.trim()) return;
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/espacios", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre: nombre.trim(), color, parentId }),
      });
      if (res.ok) {
        onCreated();
        onClose();
      } else {
        const data = await res.json().catch(() => ({}));
        setError(data.error || `Error ${res.status}`);
      }
    } catch {
      setError("Error de conexión");
    }
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <form
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
        className="bg-white rounded-lg shadow-soft-lg w-full max-w-sm p-5 animate-scale-in"
      >
        <h3 className="text-sm font-semibold text-surface-800 mb-1">
          {parentId ? `Nuevo espacio en "${parentName}"` : "Nuevo espacio de trabajo"}
        </h3>
        <p className="text-[10px] text-surface-400 mb-4">
          {parentId ? "Se creará como subcarpeta" : "Espacio raíz para organizar tareas"}
        </p>

        <label className="block text-xs text-surface-600 mb-1">Nombre</label>
        <input
          autoFocus
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          placeholder="Ej: Predios 2026"
          className="w-full text-sm border border-surface-200 rounded-md px-3 py-2 mb-3 focus:outline-none focus:border-primary-400"
        />

        <label className="block text-xs text-surface-600 mb-1.5">Color</label>
        <div className="flex gap-1.5 mb-4">
          {PRESET_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={`w-6 h-6 rounded-full transition-all ${color === c ? "ring-2 ring-offset-1 ring-surface-400 scale-110" : "hover:scale-110"}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>

        {error && (
          <p className="text-xs text-red-500 mb-2">{error}</p>
        )}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="text-xs text-surface-500 px-3 py-1.5 hover:bg-surface-100 rounded">
            Cancelar
          </button>
          <button type="submit" disabled={!nombre.trim() || saving}
            className="text-xs text-white bg-primary-600 px-3 py-1.5 rounded hover:bg-primary-700 disabled:opacity-50">
            {saving ? "Creando..." : "Crear"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Nodo del árbol ────────────────────────────────────
function SpaceNode({
  node,
  depth,
  pathname,
  isModOrAdmin,
  isAdmin,
  onAdd,
  onDelete,
  onClear,
  onDropPredios,
  onRename,
}: {
  node: any;
  depth: number;
  pathname: string;
  isModOrAdmin: boolean;
  isAdmin: boolean;
  onAdd: (parentId: string, parentName: string) => void;
  onDelete: (id: string, nombre: string) => void;
  onClear: (id: string, nombre: string) => void;
  onDropPredios: (espacioId: string, nombre: string) => void;
  onRename: (id: string, nuevoNombre: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.nombre);
  const inputRef = useRef<HTMLInputElement>(null);
  const hasChildren = node.children?.length > 0;
  const taskCount = node._count?.predios || 0;
  const isFacturado = node.nombre === "Facturado" && !node.parentId;

  // Ocultar "Facturado" para no-admin
  if (isFacturado && !isAdmin) return null;

  const countDescendants = (items: any[]): number => items.reduce(
    (sum: number, child: any) => sum + (child._count?.predios || 0) + countDescendants(child.children || []),
    0
  );
  const childCount = countDescendants(node.children || []);
  const totalCount = taskCount + childCount;

  const isActive = pathname === `/dashboard/tareas/espacio/${node.id}`;
  const isParentActive = pathname.startsWith(`/dashboard/tareas/espacio/${node.id}`);

  function handleDragOver(e: React.DragEvent) {
    if (!isModOrAdmin) return;
    if (e.dataTransfer.types.includes("text/x-predio-ids")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOver(true);
    }
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    if (!isModOrAdmin) return;
    const raw = e.dataTransfer.getData("text/x-predio-ids");
    if (raw) {
      onDropPredios(node.id, node.nombre);
    }
  }

  return (
    <div>
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group flex items-center gap-1 py-1 pr-2 rounded-md cursor-pointer transition-colors
          ${dragOver ? "bg-primary-100 ring-2 ring-primary-400" : ""}
          ${isActive ? "bg-primary-50 text-primary-700" : "hover:bg-surface-100 text-surface-600"}
          ${isFacturado ? "border-l-2 border-emerald-400" : ""}`}
        style={{ paddingLeft: `${8 + depth * 16}px` }}
      >
        {/* Chevron */}
        {hasChildren ? (
          <button onClick={() => setOpen(!open)} className="p-0.5 hover:bg-surface-200 rounded shrink-0">
            <ChevronIcon open={open} />
          </button>
        ) : (
          <span className="w-[18px] shrink-0" />
        )}

        {/* Link al espacio / edición inline */}
        {editing ? (
          <input
            ref={inputRef}
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={() => {
              const trimmed = editName.trim();
              if (trimmed && trimmed !== node.nombre) onRename(node.id, trimmed);
              else setEditName(node.nombre);
              setEditing(false);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.currentTarget.blur(); }
              if (e.key === "Escape") { setEditName(node.nombre); setEditing(false); }
            }}
            className="flex-1 min-w-0 text-xs border border-primary-400 rounded px-1.5 py-0.5 focus:outline-none bg-white"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <Link
            href={`/dashboard/tareas/espacio/${node.id}/tareas`}
            className="flex-1 flex items-center gap-1.5 min-w-0 text-xs"
            onDoubleClick={(e) => {
              if (!isModOrAdmin) return;
              e.preventDefault();
              setEditName(node.nombre);
              setEditing(true);
              setTimeout(() => inputRef.current?.select(), 0);
            }}
          >
            <EspacioIcon icono={node.icono} color={isActive || isParentActive ? node.color : "#64748b"} />
            <span className={`truncate ${isActive ? "font-medium" : ""}`}>{node.nombre}</span>
          </Link>
        )}

        {/* Count badge */}
        {totalCount > 0 && (
          <span
            className="text-[10px] text-surface-400 tabular-nums shrink-0 ml-auto"
            title={childCount > 0 ? `${taskCount} directas + ${childCount} en subcarpetas` : `${taskCount} directas`}
          >
            {totalCount}
          </span>
        )}

        {/* Add sub-space button */}
        {isModOrAdmin && (
          <>
            <button
              onClick={(e) => { e.stopPropagation(); onAdd(node.id, node.nombre); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-surface-200 rounded shrink-0 text-surface-400 hover:text-surface-600 transition-opacity"
              title="Agregar sub-espacio"
            >
              <PlusIcon />
            </button>
            {totalCount > 0 && (
              <button
                onClick={(e) => { e.stopPropagation(); onClear(node.id, node.nombre); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded shrink-0 text-surface-400 hover:text-red-500 transition-opacity"
                title="Vaciar tareas directas del espacio"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </button>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); onDelete(node.id, node.nombre); }}
              className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-red-100 rounded shrink-0 text-surface-400 hover:text-red-500 transition-opacity"
              title="Eliminar espacio"
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </>
        )}
      </div>

      {/* Children */}
      {open && hasChildren && (
        <div>
          {node.children.map((child: any) => (
            <SpaceNode
              key={child.id}
              node={child}
              depth={depth + 1}
              pathname={pathname}
              isModOrAdmin={isModOrAdmin}
              isAdmin={isAdmin}
              onAdd={onAdd}
              onDelete={onDelete}
              onClear={onClear}
              onDropPredios={onDropPredios}
              onRename={onRename}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Sidebar principal ────────────────────────────────
export default function EspaciosSidebar() {
  const pathname = usePathname();
  const { isModOrAdmin, session } = useSession();
  const isAdmin = session?.rol === "ADMIN";
  const [espacios, setEspacios] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [createModal, setCreateModal] = useState<{ parentId: string | null; parentName: string | null } | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; nombre: string } | null>(null);
  const [clearConfirm, setClearConfirm] = useState<{ id: string; nombre: string } | null>(null);
  const [dropNotice, setDropNotice] = useState<string | null>(null);

  // ── Resize sidebar ──
  const SIDEBAR_MIN = 180;
  const SIDEBAR_MAX = 400;
  const SIDEBAR_DEFAULT = 224; // w-56 = 14rem = 224px
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const resizing = useRef(false);

  useEffect(() => {
    const saved = localStorage.getItem("espacios-sidebar-w");
    if (saved) setSidebarWidth(Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, parseInt(saved))));
  }, []);

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizing.current = true;
    const startX = e.clientX;
    const startW = sidebarWidth;
    let lastW = startW;
    function onMove(ev: MouseEvent) {
      if (!resizing.current) return;
      lastW = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, startW + ev.clientX - startX));
      setSidebarWidth(lastW);
    }
    function onUp() {
      resizing.current = false;
      localStorage.setItem("espacios-sidebar-w", String(lastW));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  // ── Rename espacio ──
  async function handleRenameEspacio(id: string, nuevoNombre: string) {
    try {
      const res = await fetch(`/api/espacios/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ nombre: nuevoNombre }),
      });
      if (res.ok) fetchEspacios();
    } catch { /* ignore */ }
  }

  async function handleDeleteEspacio() {
    if (!deleteConfirm) return;
    const res = await fetch(`/api/espacios/${deleteConfirm.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      fetchEspacios();
    }
    setDeleteConfirm(null);
  }

  async function handleClearEspacio() {
    if (!clearConfirm) return;
    const res = await fetch(`/api/tareas?espacioId=${clearConfirm.id}`, { method: "DELETE", credentials: "include" });
    if (res.ok) {
      fetchEspacios();
    }
    setClearConfirm(null);
  }

  async function handleDropPredios(espacioId: string, nombre: string) {
    // Leer IDs del dataTransfer guardado en window.__draggedPredioIds
    const ids: string[] = (window as any).__draggedPredioIds || [];
    if (ids.length === 0) return;

    try {
      const res = await fetch("/api/tareas", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ids, action: "espacioId", value: espacioId }),
      });
      if (res.ok) {
        const data = await res.json();
        setDropNotice(`${data.count || ids.length} tarea(s) movida(s) a "${nombre}"`);
        setTimeout(() => setDropNotice(null), 3000);
        fetchEspacios();
        // Disparar evento para que la página de tareas se refresque
        window.dispatchEvent(new CustomEvent("espacios-updated", { detail: { movedIds: ids, targetEspacioId: espacioId } }));
      }
    } catch { /* ignore */ }
    (window as any).__draggedPredioIds = null;
  }

  const fetchEspacios = useCallback(async () => {
    const res = await fetch("/api/espacios", { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setEspacios(data.espacios || []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchEspacios();
  }, [fetchEspacios]);

  const isAllTareas = pathname === "/dashboard/tareas";

  const [mobileExpanded, setMobileExpanded] = useState(false);

  return (
    <>
      {/* ── Mobile: compact horizontal strip ── */}
      <div className="md:hidden shrink-0">
        <div className="border-b border-surface-200 bg-white px-3 py-2 flex items-center gap-2 overflow-x-auto">
          <Link
            href="/dashboard/tareas"
            className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold transition-colors ${
              isAllTareas ? "bg-primary-100 text-primary-700 ring-2 ring-primary-400" : "bg-surface-100 text-surface-500"
            }`}
            title="Todas las tareas"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
          </Link>
          {!loading && espacios.map((node) => {
            const active = pathname.startsWith(`/dashboard/tareas/espacio/${node.id}`);
            return (
              <Link
                key={node.id}
                href={`/dashboard/tareas/espacio/${node.id}/tareas`}
                className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white transition-all ${
                  active ? "ring-2 ring-offset-1 ring-surface-500 scale-110" : ""
                }`}
                style={{ backgroundColor: node.color || "#94a3b8" }}
                title={node.nombre}
              >
                {node.nombre?.charAt(0).toUpperCase()}
              </Link>
            );
          })}
          {isModOrAdmin && (
            <button
              onClick={() => setMobileExpanded(!mobileExpanded)}
              className="shrink-0 w-8 h-8 rounded-lg bg-surface-50 border border-dashed border-surface-300 flex items-center justify-center text-surface-400"
            >
              <PlusIcon />
            </button>
          )}
        </div>

        {/* Mobile expand: full space list */}
        {mobileExpanded && (
          <div className="border-b border-surface-200 bg-white px-3 py-2">
            <div className="space-y-1">
              {espacios.map((node) => (
                <SpaceNode
                  key={node.id}
                  node={node}
                  depth={0}
                  pathname={pathname}
                  isModOrAdmin={isModOrAdmin}
                  isAdmin={isAdmin}
                  onAdd={(parentId, parentName) => setCreateModal({ parentId, parentName })}
                  onDelete={(id, nombre) => setDeleteConfirm({ id, nombre })}
                  onClear={(id, nombre) => setClearConfirm({ id, nombre })}
                  onDropPredios={handleDropPredios}
                  onRename={handleRenameEspacio}
                />
              ))}
            </div>
            <button
              onClick={() => setCreateModal({ parentId: null, parentName: null })}
              className="w-full mt-2 py-1.5 text-xs text-primary-600 hover:bg-primary-50 rounded transition-colors"
            >
              + Nuevo espacio
            </button>
          </div>
        )}
      </div>

      {/* ── Desktop: full sidebar ── */}
      <aside
        className="hidden md:flex shrink-0 border-r border-surface-200 bg-white flex-col h-full overflow-hidden relative"
        style={{ width: sidebarWidth }}
      >
        {/* Header */}
        <div className="px-3 pt-3 pb-2 border-b border-surface-100">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] font-semibold text-surface-400 uppercase tracking-wider">Espacios</span>
            {isModOrAdmin && (
              <button
                onClick={() => setCreateModal({ parentId: null, parentName: null })}
                className="p-1 hover:bg-surface-100 rounded text-surface-400 hover:text-surface-600 transition-colors"
                title="Nuevo espacio"
              >
                <PlusIcon />
              </button>
            )}
          </div>
        </div>

        {/* All tasks link */}
        <div className="px-2 pt-2">
          <Link
            href="/dashboard/tareas"
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors
              ${isAllTareas ? "bg-primary-50 text-primary-700 font-medium" : "hover:bg-surface-100 text-surface-600"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.7} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zM3.75 12h.007v.008H3.75V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm-.375 5.25h.007v.008H3.75v-.008zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            Todas las tareas
          </Link>
        </div>

        {/* Tree */}
        <nav className="flex-1 overflow-y-auto px-2 py-2 scrollbar-thin">
          {loading ? (
            <div className="space-y-2 px-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-6 bg-surface-100 rounded animate-pulse" />
              ))}
            </div>
          ) : espacios.length === 0 ? (
            <div className="text-center py-8 px-2">
              <p className="text-[10px] text-surface-400 mb-2">Sin espacios creados</p>
              {isModOrAdmin && (
                <button
                  onClick={() => setCreateModal({ parentId: null, parentName: null })}
                  className="text-[10px] text-primary-600 hover:underline"
                >
                  Crear primer espacio
                </button>
              )}
            </div>
          ) : (
            espacios.map((node) => (
              <SpaceNode
                key={node.id}
                node={node}
                depth={0}
                pathname={pathname}
                isModOrAdmin={isModOrAdmin}
                isAdmin={isAdmin}
                onAdd={(parentId, parentName) => setCreateModal({ parentId, parentName })}
                onDelete={(id, nombre) => setDeleteConfirm({ id, nombre })}
                onClear={(id, nombre) => setClearConfirm({ id, nombre })}
                onDropPredios={handleDropPredios}
                onRename={handleRenameEspacio}
              />
            ))
          )}
        </nav>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-primary-400/40 active:bg-primary-400/60 transition-colors z-10"
        />
      </aside>

      {/* Toast de drop exitoso */}
      {dropNotice && (
        <div className="fixed bottom-4 right-4 z-50 bg-emerald-600 text-white text-xs px-4 py-2 rounded-lg shadow-lg animate-fade-in-up">
          {dropNotice}
        </div>
      )}

      {/* Modal */}
      {createModal && (
        <CreateSpaceModal
          parentId={createModal.parentId}
          parentName={createModal.parentName}
          onClose={() => setCreateModal(null)}
          onCreated={fetchEspacios}
        />
      )}

      {/* Modal confirmar vaciado de tareas */}
      {clearConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 animate-fade-in-up">
            <h3 className="text-sm font-semibold text-surface-800 mb-2">Vaciar tareas</h3>
            <p className="text-xs text-surface-600 mb-4">
              ¿Eliminar todas las tareas de <strong>{clearConfirm.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setClearConfirm(null)}
                className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleClearEspacio}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition-colors"
              >
                Vaciar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminación de espacio */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl shadow-xl p-5 w-full max-w-sm mx-4 animate-fade-in-up">
            <h3 className="text-sm font-semibold text-surface-800 mb-2">Eliminar espacio</h3>
            <p className="text-xs text-surface-600 mb-4">
              ¿Eliminar <strong>{deleteConfirm.nombre}</strong>? Las tareas dentro quedarán sin espacio asignado.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setDeleteConfirm(null)}
                className="px-3 py-1.5 text-xs text-surface-500 hover:bg-surface-100 rounded-md transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDeleteEspacio}
                className="px-3 py-1.5 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium transition-colors"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
