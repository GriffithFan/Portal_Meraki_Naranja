"use client";

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { toast } from "sonner";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { detectarProvincia, PROVINCIAS } from "@/utils/provinciaUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("es-MX", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDatetime(d: string) {
  return new Date(d).toLocaleString("es-MX", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

// Íconos SVG minimalistas
const IconDocument = () => (
  <svg className="w-8 h-8 text-primary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconPdf = () => (
  <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12l3 3m0 0l3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconWord = () => (
  <svg className="w-8 h-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
  </svg>
);

const IconFolderOpen = () => (
  <svg className="w-12 h-12 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9.776c.112-.017.227-.026.344-.026h15.812c.117 0 .232.009.344.026m-16.5 0a2.25 2.25 0 00-1.883 2.542l.857 6a2.25 2.25 0 002.227 1.932H19.05a2.25 2.25 0 002.227-1.932l.857-6a2.25 2.25 0 00-1.883-2.542m-16.5 0V6A2.25 2.25 0 016 3.75h3.879a1.5 1.5 0 011.06.44l2.122 2.12a1.5 1.5 0 001.06.44H18A2.25 2.25 0 0120.25 9v.776" />
  </svg>
);

export default function ActasPage() {
  const LIST_LIMIT = 500;
  const SEARCH_LIMIT = 3000;

  const { isModOrAdmin, isAdmin } = useSession();
  const { puedeEditar } = usePermisos();
  const canEdit = isModOrAdmin || puedeEditar("actas");
  const [actas, setActas] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }
  const [search, setSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filtros
  const [filterProvincia, setFilterProvincia] = useState("");
  const [filterDesde, setFilterDesde] = useState("");
  const [filterHasta, setFilterHasta] = useState("");

  // Selección
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ ids: string[]; label: string } | null>(null);

  // Carga masiva
  const [showBulk, setShowBulk] = useState(false);
  const [bulkFiles, setBulkFiles] = useState<File[]>([]);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; failed: number; skipped: number; overwritten: number; total: number } | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const bulkRef = useRef<HTMLInputElement>(null);
  const [bulkDuplicates, setBulkDuplicates] = useState<{ file: File; existing: any }[]>([]);
  const [bulkChecking, setBulkChecking] = useState(false);

  // Individual duplicate confirm
  const [dupConfirm, setDupConfirm] = useState<{ file: File; nombre: string; descripcion: string; existing: any } | null>(null);

  // Progreso de subida (XHR), vista previa y paginado visual
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [previewActa, setPreviewActa] = useState<any | null>(null);
  const [visibleCount, setVisibleCount] = useState(60);
  const [dragOver, setDragOver] = useState(false);

  const fetchActas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    const hasSearch = !!search.trim();
    if (search) params.set("buscar", search);
    if (filterProvincia) params.set("provincia", filterProvincia);
    if (filterDesde) params.set("desde", filterDesde);
    if (filterHasta) params.set("hasta", filterHasta);
    params.set("limit", String(hasSearch ? SEARCH_LIMIT : LIST_LIMIT));
    const res = await fetch(`/api/actas?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setActas(data.actas || []);
      setTotal(data.total || 0);
    }
    setLoading(false);
    setSelected(new Set());
    setVisibleCount(60);
  }, [search, filterProvincia, filterDesde, filterHasta]);

  // Debounce: no dispara un fetch por cada tecla de la búsqueda.
  useEffect(() => {
    const t = setTimeout(fetchActas, 350);
    return () => clearTimeout(t);
  }, [fetchActas]);

  // Provincias encontradas en las actas actuales (para el dropdown)
  const provinciasEnActas = useMemo(() => {
    const set = new Set<string>();
    for (const a of actas) {
      const p = detectarProvincia(a.nombre);
      if (p) set.add(p);
    }
    return PROVINCIAS.filter((p) => set.has(p));
  }, [actas]);

  // Filtros activos
  const hasFilters = !!(filterProvincia || filterDesde || filterHasta);

  function clearFilters() {
    setFilterProvincia("");
    setFilterDesde("");
    setFilterHasta("");
  }

  // --- Selección ---
  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === actas.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(actas.map((a) => a.id)));
    }
  }

  // --- Eliminar ---
  function requestDeleteSingle(acta: any) {
    setDeleteConfirm({ ids: [acta.id], label: `"${acta.nombre}"` });
  }

  function requestDeleteSelected() {
    setDeleteConfirm({ ids: Array.from(selected), label: `${selected.size} acta${selected.size !== 1 ? "s" : ""} seleccionada${selected.size !== 1 ? "s" : ""}` });
  }

  function requestDeleteAll() {
    setDeleteConfirm({ ids: actas.map((a) => a.id), label: `TODAS las ${actas.length} actas${hasFilters ? " filtradas" : ""}` });
  }

  async function confirmDelete() {
    if (!deleteConfirm) return;
    setDeleting(true);
    if (deleteConfirm.ids.length === 1) {
      await fetch(`/api/actas/${deleteConfirm.ids[0]}`, { method: "DELETE", credentials: "include" });
    } else {
      await fetch("/api/actas/bulk-delete", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: deleteConfirm.ids }),
      });
    }
    setDeleting(false);
    setDeleteConfirm(null);
    fetchActas();
  }

  // Extraer número de 6 dígitos del nombre del archivo
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const match = file.name.match(/(\d{6})/);
      if (match) {
        setNombre(match[1]);
      }
    }
  }

  // Subida con XMLHttpRequest para mostrar progreso real (fetch no lo expone).
  function subirConProgreso(fd: FormData): Promise<{ status: number; json: any }> {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/actas");
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setUploadPct(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        let json: any = {};
        try { json = JSON.parse(xhr.responseText); } catch { /* vacío */ }
        resolve({ status: xhr.status, json });
      };
      xhr.onerror = () => reject(new Error("Error de red al subir"));
      xhr.send(fd);
    });
  }

  async function handleUpload(e: React.FormEvent, overwrite = false) {
    e.preventDefault();
    const file = selectedFile || fileRef.current?.files?.[0];
    if (!file || !nombre) return;

    setUploading(true);
    setUploadPct(0);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("nombre", nombre);
    if (descripcion) fd.append("descripcion", descripcion);
    if (overwrite) fd.append("overwrite", "true");

    try {
      const { status, json } = await subirConProgreso(fd);
      if (status === 409) {
        setDupConfirm({ file, nombre, descripcion, existing: json.duplicado });
        return;
      }
      if (status >= 200 && status < 300) {
        setShowUpload(false);
        setNombre("");
        setDescripcion("");
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        fetchActas();
      }
    } catch { /* la UI queda abierta para reintentar */ }
    finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  async function confirmOverwrite() {
    if (!dupConfirm) return;
    setDupConfirm(null);
    setUploading(true);
    setUploadPct(0);
    const fd = new FormData();
    fd.append("file", dupConfirm.file);
    fd.append("nombre", dupConfirm.nombre);
    if (dupConfirm.descripcion) fd.append("descripcion", dupConfirm.descripcion);
    fd.append("overwrite", "true");

    try {
      const { status } = await subirConProgreso(fd);
      if (status >= 200 && status < 300) {
        setShowUpload(false);
        setNombre("");
        setDescripcion("");
        setSelectedFile(null);
        if (fileRef.current) fileRef.current.value = "";
        fetchActas();
      }
    } catch { /* reintento manual */ }
    finally {
      setUploading(false);
      setUploadPct(null);
    }
  }

  function downloadActa(acta: any) {
    window.open(`/api/actas/${acta.id}`, "_blank");
  }

  const esPdf = (acta: any) => (acta?.archivoTipo || "").includes("pdf") || /\.pdf$/i.test(acta?.archivoNombre || "");
  const esWord = (acta: any) => /\.(docx?|odt)$/i.test(acta?.archivoNombre || "");

  // Convierte el acta de Word a PDF (vía OnlyOffice) y la descarga.
  const [pdfLoadingId, setPdfLoadingId] = useState<string | null>(null);
  async function downloadPdf(acta: any) {
    if (pdfLoadingId) return;
    setPdfLoadingId(acta.id);
    try {
      const res = await fetch(`/api/actas/${acta.id}/pdf`);
      if (!res.ok) {
        const msg = await res.json().catch(() => ({}));
        toast.error(msg?.error || "No se pudo generar el PDF");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = (acta.archivoNombre || "acta").replace(/\.(docx?|odt)$/i, "") + ".pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast.error("No se pudo generar el PDF");
    } finally {
      setPdfLoadingId(null);
    }
  }

  // Aceptar un archivo soltado (drag & drop) en el modal de subida.
  function aceptarArchivo(file: File | undefined | null) {
    if (!file) return;
    setSelectedFile(file);
    const match = file.name.match(/(\d{6})/);
    if (match) setNombre(match[1]);
  }

  function handleBulkSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const valid = Array.from(files).filter(f => /\.(pdf|docx|doc)$/i.test(f.name) && f.size <= 10 * 1024 * 1024);
    setBulkFiles(valid);
    setBulkDuplicates([]);
    setBulkProgress(null);
  }

  async function checkBulkDuplicates() {
    if (bulkFiles.length === 0) return;
    setBulkChecking(true);

    const allActas: any[] = [];
    let page = 1;
    let totalPages = 1;

    while (page <= totalPages) {
      const res = await fetch(`/api/actas?limit=${SEARCH_LIMIT}&page=${page}`, { credentials: "include" });
      if (!res.ok) break;
      const data = await res.json();
      const pageActas = Array.isArray(data?.actas) ? data.actas : [];
      allActas.push(...pageActas);
      const total = Number(data?.total || allActas.length);
      totalPages = Math.max(1, Math.ceil(total / SEARCH_LIMIT));
      page += 1;
    }

    const existingMap = new Map<string, any>();
    for (const a of allActas) {
      existingMap.set(a.nombre.toLowerCase(), a);
    }

    const dups: { file: File; existing: any }[] = [];
    for (const file of bulkFiles) {
      const nombre = file.name.replace(/\.(pdf|docx|doc)$/i, "").trim().toLowerCase();
      const match = existingMap.get(nombre);
      if (match) dups.push({ file, existing: match });
    }

    setBulkDuplicates(dups);
    setBulkChecking(false);

    if (dups.length === 0) {
      doBulkUpload(false);
    }
  }

  async function doBulkUpload(overwriteDups: boolean) {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);
    const dupNames = new Set(bulkDuplicates.map(d => d.file.name));
    setBulkProgress({ done: 0, failed: 0, skipped: 0, overwritten: 0, total: bulkFiles.length });

    const BATCH = 2;
    const RETRIES = 2;

    async function uploadWithRetry(file: File, isDup: boolean): Promise<"skipped" | "overwritten" | "ok"> {
      for (let attempt = 0; attempt <= RETRIES; attempt++) {
        try {
          const fd = new FormData();
          fd.append("file", file);
          const nombre = file.name.replace(/\.(pdf|docx|doc)$/i, "").trim();
          fd.append("nombre", nombre || file.name);
          if (isDup && overwriteDups) fd.append("overwrite", "true");

          const res = await fetch("/api/actas", { method: "POST", credentials: "include", body: fd });
          if (res.status === 409) return "skipped";
          if (res.ok) return isDup ? "overwritten" : "ok";

          // Reintento para errores transitorios de servidor/gateway.
          if ((res.status >= 500 || res.status === 429) && attempt < RETRIES) continue;
          throw new Error(`upload failed (${res.status})`);
        } catch {
          if (attempt >= RETRIES) throw new Error("upload failed");
        }
      }

      throw new Error("upload failed");
    }
    let done = 0;
    let failed = 0;
    let skipped = 0;
    let overwritten = 0;

    for (let i = 0; i < bulkFiles.length; i += BATCH) {
      const batch = bulkFiles.slice(i, i + BATCH);
      const results = await Promise.allSettled(
        batch.map(async (file) => {
          const isDup = dupNames.has(file.name);
          if (isDup && !overwriteDups) {
            return "skipped";
          }
          return uploadWithRetry(file, isDup);
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "skipped") { skipped++; }
          else if (r.value === "overwritten") { overwritten++; done++; }
          else { done++; }
        } else { failed++; }
      }
      setBulkProgress({ done, failed, skipped, overwritten, total: bulkFiles.length });
    }

    setBulkUploading(false);
    if (failed === 0) {
      setShowBulk(false);
      setBulkFiles([]);
      setBulkProgress(null);
      setBulkDuplicates([]);
      if (bulkRef.current) bulkRef.current.value = "";
    }
    fetchActas();
  }

  function iconForType(tipo: string) {
    if (tipo.includes("pdf")) return <IconPdf />;
    if (tipo.includes("word") || tipo.includes("docx")) return <IconWord />;
    return <IconDocument />;
  }

  return (
    <div className="animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 dark:text-surface-100">Actas</h1>
          <p className="text-xs text-surface-400">Documentos y actas del proyecto · {total} total</p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <>
              <button onClick={() => setShowBulk(true)} className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-md text-xs font-medium hover:bg-surface-200 transition-colors flex items-center gap-1.5 border border-surface-200">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3h9" /></svg>
                Carga masiva
              </button>
              <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                Subir acta
              </button>
            </>
          )}
        </div>
      </div>

      {/* Búsqueda y filtros */}
      <div className="mb-4 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, descripción o predio..." className="flex-1 max-w-md px-3 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
          <select value={filterProvincia} onChange={(e) => setFilterProvincia(e.target.value)} className="px-3 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400 bg-white min-w-[160px]">
            <option value="">Todas las provincias</option>
            {(filterProvincia ? PROVINCIAS : provinciasEnActas).map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <input type="date" value={filterDesde} onChange={(e) => setFilterDesde(e.target.value)} className="px-3 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" title="Desde" />
          <input type="date" value={filterHasta} onChange={(e) => setFilterHasta(e.target.value)} className="px-3 py-1.5 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" title="Hasta" />
          {hasFilters && (
            <button onClick={clearFilters} className="px-3 py-1.5 text-xs text-surface-500 hover:text-surface-700 hover:bg-surface-100 rounded-md transition-colors">
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Barra de selección / acciones masivas */}
      {canEdit && actas.length > 0 && (
        <div className="flex items-center gap-3 mb-3 px-1">
          <label className="flex items-center gap-1.5 text-xs text-surface-500 cursor-pointer select-none">
            <input type="checkbox" checked={actas.length > 0 && selected.size === actas.length} onChange={toggleSelectAll} className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5" />
            Seleccionar todo ({actas.length})
          </label>
          {selected.size > 0 && (
            <>
              <span className="text-xs text-surface-400">|</span>
              <span className="text-xs font-medium text-primary-600">{selected.size} seleccionada{selected.size !== 1 ? "s" : ""}</span>
              <button onClick={requestDeleteSelected} className="px-2.5 py-1 text-xs text-red-600 hover:bg-red-50 rounded-md transition-colors font-medium flex items-center gap-1">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                Eliminar seleccionadas
              </button>
              <span className="text-xs text-surface-400">|</span>
              <button onClick={requestDeleteAll} className="px-2.5 py-1 text-xs text-red-500 hover:bg-red-50 rounded-md transition-colors flex items-center gap-1">
                Eliminar todas{hasFilters ? " filtradas" : ""}
              </button>
            </>
          )}
        </div>
      )}

      {/* Lista de actas */}
      <div className="bg-white dark:bg-surface-800 rounded-lg border border-surface-200 dark:border-surface-700">
        {loading ? (
          <ListSkeleton items={5} />
        ) : actas.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <div className="flex justify-center mb-3"><IconFolderOpen /></div>
            <p className="text-lg font-medium mb-1">Sin actas</p>
            <p className="text-sm">{search || hasFilters ? "No se encontraron resultados" : "Aún no se han subido documentos"}</p>
            {hasFilters && (
              <button onClick={clearFilters} className="mt-3 text-xs text-primary-600 hover:underline">Limpiar filtros</button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-surface-100 dark:divide-surface-700">
            {actas.slice(0, visibleCount).map((a) => {
              const prov = detectarProvincia(a.nombre);
              return (
                <div key={a.id} className={`flex items-center gap-4 px-5 py-4 hover:bg-surface-50 dark:hover:bg-surface-700/50 transition-colors group ${selected.has(a.id) ? "bg-primary-50/50 dark:bg-primary-900/20" : ""}`}>
                  {canEdit && (
                    <input
                      type="checkbox"
                      checked={selected.has(a.id)}
                      onChange={() => toggleSelect(a.id)}
                      className="rounded border-surface-300 text-primary-600 focus:ring-primary-500 w-3.5 h-3.5 flex-shrink-0"
                    />
                  )}
                  {iconForType(a.archivoTipo)}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-surface-800 dark:text-surface-100 truncate">{a.nombre}</span>
                      {prov && (
                        <span className="text-[10px] bg-primary-50 text-primary-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                          {prov}
                        </span>
                      )}
                      {a.version > 1 && (
                        <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full font-medium flex-shrink-0">
                          v{a.version}
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                      <span>{a.archivoNombre}</span>
                      <span>{formatSize(a.archivoSize)}</span>
                      <span>Subido por {a.subidoPor?.nombre}</span>
                    </div>
                    {a.descripcion && <p className="text-xs text-surface-500 mt-1">{a.descripcion}</p>}
                    {a.predio && <span className="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full mt-1 inline-block">Predio: {a.predio.nombre}</span>}
                  </div>
                  {/* Fecha de subida prominente */}
                  <div className="text-right flex-shrink-0 hidden sm:block">
                    <div className="text-xs font-medium text-surface-600">{formatDate(a.createdAt)}</div>
                    <div className="text-[10px] text-surface-400">{new Date(a.createdAt).toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit" })}</div>
                  </div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {esPdf(a) && (
                      <button onClick={() => setPreviewActa(a)} className="px-3 py-1.5 text-sm text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700 rounded-lg transition-colors font-medium" title="Ver sin descargar">
                        Ver
                      </button>
                    )}
                    <button onClick={() => downloadActa(a)} className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors font-medium" title="Descargar">
                      Descargar
                    </button>
                    {esWord(a) && (
                      <button
                        onClick={() => downloadPdf(a)}
                        disabled={pdfLoadingId === a.id}
                        className="px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait"
                        title="Descargar como PDF (convierte el Word a PDF)"
                      >
                        {pdfLoadingId === a.id ? "Generando…" : "PDF"}
                      </button>
                    )}
                    {isAdmin && /\.(docx|doc|odt|xlsx|xls|pptx|ppt)$/i.test(a.archivoNombre || "") && (
                      <a href={`/dashboard/actas/${a.id}/editar`} className="px-3 py-1.5 text-sm font-medium text-accent-600 hover:bg-accent-50 rounded-lg transition-colors" title="Editar en el navegador (solo administradores)">
                        Editar
                      </a>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => requestDeleteSingle(a)}
                        className="p-1.5 text-surface-400 hover:text-red-500 hover:bg-red-50 rounded-md transition-colors opacity-0 group-hover:opacity-100"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
            {actas.length > visibleCount && (
              <div className="p-3 text-center">
                <button
                  onClick={() => setVisibleCount((c) => c + 100)}
                  className="px-4 py-2 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30 rounded-lg transition-colors"
                >
                  Mostrar más ({actas.length - visibleCount} restantes)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Fecha en mobile (visible below breakpoint) */}
      <style>{`@media(max-width:639px){.acta-date-mobile{display:block!important}}`}</style>

      {/* Modal upload */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleUpload} className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-md mx-4 animate-fade-in-up">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-4">Subir Acta</h2>
            <div className="space-y-3">
              <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre / Código del predio *" className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" rows={2} className="w-full px-3 py-2 border border-surface-200 dark:border-surface-600 dark:bg-surface-800 dark:text-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Archivo (PDF o DOCX) *</label>
                {/* Zona de arrastrar y soltar (también admite click) */}
                <label
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = e.dataTransfer.files?.[0];
                    if (f && /\.(pdf|docx|doc)$/i.test(f.name)) aceptarArchivo(f);
                  }}
                  className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-colors ${
                    dragOver ? "border-primary-400 bg-primary-50" : "border-surface-300 hover:border-surface-400 hover:bg-surface-50"
                  }`}
                >
                  <svg className="w-6 h-6 text-surface-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <span className="text-xs text-surface-500 px-3 text-center truncate max-w-full">
                    {selectedFile?.name || "Arrastrá el archivo acá o hacé click"}
                  </span>
                  <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" onChange={handleFileSelect} className="hidden" />
                </label>
                <p className="text-[10px] text-surface-400 mt-1">Se extraerá automáticamente el número de 6 dígitos del nombre (ej: Acta_600222.docx)</p>
              </div>
              {uploadPct != null && (
                <div>
                  <div className="flex justify-between text-[10px] text-surface-500 mb-0.5"><span>Subiendo…</span><span>{uploadPct}%</span></div>
                  <div className="h-1.5 bg-surface-200 rounded-full overflow-hidden">
                    <div className="h-full bg-primary-500 transition-all duration-200" style={{ width: `${uploadPct}%` }} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setNombre(""); }} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" disabled={uploading || !selectedFile} className="px-4 py-2 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium disabled:opacity-50">
                {uploading ? `Subiendo${uploadPct != null ? ` ${uploadPct}%` : "..."}` : "Subir"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Visor de PDF (sin descargar) */}
      {previewActa && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-2 sm:p-6" onClick={() => setPreviewActa(null)}>
          <div className="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white dark:bg-surface-900 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-surface-200 dark:border-surface-700 px-4 py-2.5">
              <p className="truncate text-sm font-semibold text-surface-800 dark:text-surface-100">{previewActa.archivoNombre || previewActa.nombre}</p>
              <div className="flex items-center gap-1">
                <button onClick={() => downloadActa(previewActa)} className="rounded-lg px-3 py-1.5 text-xs font-medium text-primary-600 hover:bg-primary-50 dark:hover:bg-primary-900/30">Descargar</button>
                <button onClick={() => setPreviewActa(null)} className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800" title="Cerrar">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <iframe src={`/api/actas/${previewActa.id}?inline=true`} title="Vista previa del acta" className="h-full w-full flex-1 bg-surface-100 dark:bg-surface-950" />
          </div>
        </div>
      )}

      {/* Modal carga masiva */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 animate-fade-in-up max-h-[85vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-surface-800 dark:text-surface-100 mb-1">Carga masiva de actas</h2>
            <p className="text-xs text-surface-400 mb-4">Seleccioná múltiples archivos PDF o DOCX. Se subirán con su nombre original.</p>

            <div className="space-y-4">
              <div>
                <label className="flex flex-col items-center justify-center w-full h-28 border-2 border-dashed border-surface-300 rounded-lg cursor-pointer hover:border-surface-400 hover:bg-surface-50 transition-colors">
                  <svg className="w-8 h-8 text-surface-400 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
                  <span className="text-xs text-surface-500">Click para seleccionar archivos</span>
                  <span className="text-[10px] text-surface-400 mt-0.5">PDF, DOCX, DOC · Máx 10MB c/u</span>
                  <input ref={bulkRef} type="file" accept=".pdf,.docx,.doc" multiple onChange={handleBulkSelect} className="hidden" />
                </label>
              </div>

              {bulkFiles.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-surface-700">{bulkFiles.length} archivo{bulkFiles.length !== 1 ? "s" : ""} seleccionado{bulkFiles.length !== 1 ? "s" : ""}</span>
                    <span className="text-[10px] text-surface-400">{formatSize(bulkFiles.reduce((s, f) => s + f.size, 0))} total</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto border border-surface-200 rounded-md divide-y divide-surface-100">
                    {bulkFiles.slice(0, 50).map((f, i) => (
                      <div key={i} className="flex items-center gap-2 px-3 py-1.5 text-xs">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${f.name.endsWith(".pdf") ? "bg-red-400" : "bg-blue-400"}`} />
                        <span className="truncate flex-1 text-surface-700">{f.name}</span>
                        <span className="text-surface-400 flex-shrink-0">{formatSize(f.size)}</span>
                      </div>
                    ))}
                    {bulkFiles.length > 50 && (
                      <div className="px-3 py-1.5 text-[10px] text-surface-400 text-center">
                        ...y {bulkFiles.length - 50} más
                      </div>
                    )}
                  </div>
                </div>
              )}

              {bulkDuplicates.length > 0 && !bulkUploading && !bulkProgress && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <div className="flex items-start gap-2 mb-2">
                    <svg className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
                    <div>
                      <p className="text-xs font-semibold text-amber-800">
                        {bulkDuplicates.length} archivo{bulkDuplicates.length !== 1 ? "s" : ""} ya existe{bulkDuplicates.length !== 1 ? "n" : ""}
                      </p>
                      <p className="text-[10px] text-amber-600 mt-0.5">Elegí si querés sobreescribir los duplicados o solo subir los nuevos.</p>
                    </div>
                  </div>
                  <div className="max-h-28 overflow-y-auto mb-3 border border-amber-200 rounded-md bg-white divide-y divide-amber-100">
                    {bulkDuplicates.slice(0, 20).map((d, i) => (
                      <div key={i} className="flex items-center gap-2 px-2.5 py-1 text-[11px]">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                        <span className="truncate flex-1 text-amber-800">{d.file.name}</span>
                        <span className="text-amber-500 flex-shrink-0">v{d.existing.version || 1}</span>
                      </div>
                    ))}
                    {bulkDuplicates.length > 20 && (
                      <div className="px-2.5 py-1 text-[10px] text-amber-500 text-center">...y {bulkDuplicates.length - 20} más</div>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => doBulkUpload(true)} className="flex-1 px-3 py-1.5 bg-amber-600 text-white rounded-md text-xs font-medium hover:bg-amber-700 transition-colors">
                      Sobreescribir duplicados
                    </button>
                    <button onClick={() => doBulkUpload(false)} className="flex-1 px-3 py-1.5 bg-white text-surface-700 border border-surface-300 rounded-md text-xs font-medium hover:bg-surface-50 transition-colors">
                      Solo subir nuevos
                    </button>
                  </div>
                </div>
              )}

              {bulkProgress && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium text-surface-700">
                      {bulkProgress.done + bulkProgress.failed + bulkProgress.skipped} / {bulkProgress.total}
                    </span>
                    <span className="text-[10px] text-surface-400 flex gap-2">
                      {bulkProgress.overwritten > 0 && <span className="text-amber-600">{bulkProgress.overwritten} sobreescrito{bulkProgress.overwritten !== 1 ? "s" : ""}</span>}
                      {bulkProgress.skipped > 0 && <span className="text-surface-500">{bulkProgress.skipped} omitido{bulkProgress.skipped !== 1 ? "s" : ""}</span>}
                      {bulkProgress.failed > 0 && <span className="text-red-500">{bulkProgress.failed} error{bulkProgress.failed !== 1 ? "es" : ""}</span>}
                      {bulkProgress.failed === 0 && !bulkUploading && (bulkProgress.done + bulkProgress.skipped) === bulkProgress.total && <span className="text-emerald-600">Completado</span>}
                    </span>
                  </div>
                  <div className="w-full bg-surface-200 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-primary-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${((bulkProgress.done + bulkProgress.failed + bulkProgress.skipped) / bulkProgress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button
                type="button"
                onClick={() => { setShowBulk(false); setBulkFiles([]); setBulkProgress(null); setBulkDuplicates([]); if (bulkRef.current) bulkRef.current.value = ""; }}
                disabled={bulkUploading || bulkChecking}
                className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md disabled:opacity-50"
              >
                {bulkProgress && !bulkUploading && (bulkProgress.done + bulkProgress.skipped) === bulkProgress.total ? "Cerrar" : "Cancelar"}
              </button>
              <button
                type="button"
                onClick={checkBulkDuplicates}
                disabled={bulkUploading || bulkChecking || bulkFiles.length === 0}
                className="px-4 py-2 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium disabled:opacity-50"
              >
                {bulkChecking ? "Verificando..." : bulkUploading ? `Subiendo... (${bulkProgress?.done || 0}/${bulkFiles.length})` : `Subir ${bulkFiles.length} archivo${bulkFiles.length !== 1 ? "s" : ""}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación duplicado individual */}
      {dupConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 animate-fade-in-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">Acta duplicada</h3>
                <p className="text-xs text-surface-500 mt-1">
                  Ya existe un acta con el nombre <strong className="text-surface-700">&quot;{dupConfirm.existing.nombre}&quot;</strong>
                </p>
                <div className="mt-2 text-[10px] text-surface-400 space-y-0.5">
                  <p>Archivo actual: {dupConfirm.existing.archivoNombre}</p>
                  <p>Tamaño: {formatSize(dupConfirm.existing.archivoSize)}</p>
                  <p>Subido: {formatDatetime(dupConfirm.existing.createdAt)}</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDupConfirm(null)} className="flex-1 px-3 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md border border-surface-200">
                Cancelar
              </button>
              <button onClick={confirmOverwrite} className="flex-1 px-3 py-2 text-xs bg-amber-600 text-white rounded-md hover:bg-amber-700 font-medium">
                Sobreescribir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmación eliminación */}
      {deleteConfirm && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
          <div className="bg-white dark:bg-surface-800 rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 animate-fade-in-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800 dark:text-surface-100">Confirmar eliminación</h3>
                <p className="text-xs text-surface-500 mt-1">
                  ¿Estás seguro de eliminar {deleteConfirm.label}?
                </p>
                <p className="text-[10px] text-red-500 mt-1.5">Esta acción no se puede deshacer. Se eliminarán los archivos del servidor.</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDeleteConfirm(null)} disabled={deleting} className="flex-1 px-3 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md border border-surface-200 disabled:opacity-50">
                Cancelar
              </button>
              <button onClick={confirmDelete} disabled={deleting} className="flex-1 px-3 py-2 text-xs bg-red-600 text-white rounded-md hover:bg-red-700 font-medium disabled:opacity-50">
                {deleting ? "Eliminando..." : "Eliminar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
