"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "@/hooks/useSession";
import { usePermisos } from "@/hooks/usePermisos";
import { ListSkeleton } from "@/components/ui/Skeletons";

/* eslint-disable @typescript-eslint/no-explicit-any */

function formatSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
  const { isModOrAdmin } = useSession();
  const { puedeEditar } = usePermisos();
  const canEdit = isModOrAdmin || puedeEditar("actas");
  const [actas, setActas] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const fetchActas = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (search) params.set("buscar", search);
    const res = await fetch(`/api/actas?${params}`, { credentials: "include" });
    if (res.ok) {
      const data = await res.json();
      setActas(data.actas || []);
    }
    setLoading(false);
  }, [search]);

  useEffect(() => { fetchActas(); }, [fetchActas]);

  // Extraer número de 6 dígitos del nombre del archivo
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      // Buscar patrón de 6 dígitos en el nombre (ej: Acta_600222.docx → 600222)
      const match = file.name.match(/(\d{6})/);
      if (match) {
        setNombre(match[1]);
      }
    }
  }

  async function handleUpload(e: React.FormEvent, overwrite = false) {
    e.preventDefault();
    const file = selectedFile || fileRef.current?.files?.[0];
    if (!file || !nombre) return;

    setUploading(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("nombre", nombre);
    if (descripcion) fd.append("descripcion", descripcion);
    if (overwrite) fd.append("overwrite", "true");

    const res = await fetch("/api/actas", { method: "POST", credentials: "include", body: fd });
    setUploading(false);

    if (res.status === 409) {
      const data = await res.json();
      setDupConfirm({ file, nombre, descripcion, existing: data.duplicado });
      return;
    }

    if (res.ok) {
      setShowUpload(false);
      setNombre("");
      setDescripcion("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchActas();
    }
  }

  async function confirmOverwrite() {
    if (!dupConfirm) return;
    setDupConfirm(null);
    setUploading(true);
    const fd = new FormData();
    fd.append("file", dupConfirm.file);
    fd.append("nombre", dupConfirm.nombre);
    if (dupConfirm.descripcion) fd.append("descripcion", dupConfirm.descripcion);
    fd.append("overwrite", "true");

    const res = await fetch("/api/actas", { method: "POST", credentials: "include", body: fd });
    setUploading(false);
    if (res.ok) {
      setShowUpload(false);
      setNombre("");
      setDescripcion("");
      setSelectedFile(null);
      if (fileRef.current) fileRef.current.value = "";
      fetchActas();
    }
  }

  function downloadActa(acta: any) {
    window.open(`/api/actas/${acta.id}`, "_blank");
  }

  function handleBulkSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    const valid = Array.from(files).filter(f => /\.(pdf|docx|doc)$/i.test(f.name) && f.size <= 10 * 1024 * 1024);
    setBulkFiles(valid);
    setBulkDuplicates([]);
    setBulkProgress(null);
  }

  // Check duplicates before bulk uploading
  async function checkBulkDuplicates() {
    if (bulkFiles.length === 0) return;
    setBulkChecking(true);

    // Fetch all existing acta names
    const res = await fetch("/api/actas?limit=500", { credentials: "include" });
    const data = res.ok ? await res.json() : { actas: [] };
    const existingMap = new Map<string, any>();
    for (const a of (data.actas || [])) {
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
      // No duplicates, proceed directly
      doBulkUpload(false);
    }
    // If duplicates found, UI will show the prompt
  }

  async function doBulkUpload(overwriteDups: boolean) {
    if (bulkFiles.length === 0) return;
    setBulkUploading(true);
    const dupNames = new Set(bulkDuplicates.map(d => d.file.name));
    setBulkProgress({ done: 0, failed: 0, skipped: 0, overwritten: 0, total: bulkFiles.length });

    const BATCH = 5;
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
            skipped++;
            return "skipped";
          }
          const fd = new FormData();
          fd.append("file", file);
          const nombre = file.name.replace(/\.(pdf|docx|doc)$/i, "").trim();
          fd.append("nombre", nombre || file.name);
          if (isDup && overwriteDups) fd.append("overwrite", "true");
          const res = await fetch("/api/actas", { method: "POST", credentials: "include", body: fd });
          if (!res.ok) throw new Error("upload failed");
          return isDup ? "overwritten" : "ok";
        })
      );
      for (const r of results) {
        if (r.status === "fulfilled") {
          if (r.value === "skipped") { /* already counted */ }
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Actas</h1>
          <p className="text-xs text-surface-400">Documentos y actas del proyecto</p>
        </div>
        {canEdit && (
          <div className="flex items-center gap-2">
            <button onClick={() => setShowBulk(true)} className="px-3 py-1.5 bg-surface-100 text-surface-700 rounded-md text-xs font-medium hover:bg-surface-200 transition-colors flex items-center gap-1.5 border border-surface-200">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3h9" /></svg>
              Carga masiva
            </button>
            <button onClick={() => setShowUpload(true)} className="px-3 py-1.5 bg-surface-800 text-white rounded-md text-xs font-medium hover:bg-surface-700 transition-colors flex items-center gap-1.5">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>
              Subir acta
            </button>
          </div>
        )}
      </div>

      {/* Búsqueda */}
      <div className="mb-4">
        <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nombre, descripción o predio..." className="w-full max-w-md px-3 py-1.5 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
      </div>

      {/* Lista de actas */}
      <div className="bg-white rounded-lg border border-surface-200">
        {loading ? (
          <ListSkeleton items={5} />
        ) : actas.length === 0 ? (
          <div className="text-center py-16 text-surface-400">
            <div className="flex justify-center mb-3"><IconFolderOpen /></div>
            <p className="text-lg font-medium mb-1">Sin actas</p>
            <p className="text-sm">{search ? "No se encontraron resultados" : "Aún no se han subido documentos"}</p>
          </div>
        ) : (
          <div className="divide-y divide-surface-100">
            {actas.map((a) => (
              <div key={a.id} className="flex items-center gap-4 px-5 py-4 hover:bg-surface-50 transition-colors">
                {iconForType(a.archivoTipo)}
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-surface-800 truncate">{a.nombre}</div>
                  <div className="text-xs text-surface-400 flex flex-wrap items-center gap-x-3 gap-y-1 mt-0.5">
                    <span>{a.archivoNombre}</span>
                    <span>{formatSize(a.archivoSize)}</span>
                    <span>Subido por {a.subidoPor?.nombre}</span>
                    <span>{new Date(a.createdAt).toLocaleDateString("es-MX")}</span>
                  </div>
                  {a.descripcion && <p className="text-xs text-surface-500 mt-1">{a.descripcion}</p>}
                  {a.predio && <span className="text-xs bg-surface-100 text-surface-600 px-2 py-0.5 rounded-full mt-1 inline-block">Predio: {a.predio.nombre}</span>}
                </div>
                <button onClick={() => downloadActa(a)} className="px-3 py-1.5 text-sm text-primary-600 hover:bg-primary-50 rounded-lg transition-colors font-medium">
                  Descargar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal upload */}
      {showUpload && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <form onSubmit={handleUpload} className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 animate-fade-in-up">
            <h2 className="text-base font-semibold text-surface-800 mb-4">Subir Acta</h2>
            <div className="space-y-3">
              <input required value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Nombre / Código del predio *" className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <textarea value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Descripción (opcional)" rows={2} className="w-full px-3 py-2 border border-surface-200 rounded-md text-xs focus:outline-none focus:border-surface-400" />
              <div>
                <label className="block text-xs font-medium text-surface-600 mb-1">Archivo (PDF o DOCX) *</label>
                <div className="flex items-center gap-3">
                  <label className="px-3 py-1.5 bg-surface-100 text-surface-600 rounded-md text-xs font-medium cursor-pointer hover:bg-surface-200 transition-colors">
                    Seleccionar archivo
                    <input ref={fileRef} type="file" accept=".pdf,.docx,.doc" required onChange={handleFileSelect} className="hidden" />
                  </label>
                  <span className="text-sm text-surface-500 truncate">
                    {selectedFile?.name || "Ningún archivo seleccionado"}
                  </span>
                </div>
                <p className="text-[10px] text-surface-400 mt-1">Se extraerá automáticamente el número de 6 dígitos del nombre (ej: Acta_600222.docx)</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button type="button" onClick={() => { setShowUpload(false); setSelectedFile(null); setNombre(""); }} className="px-4 py-2 text-xs text-surface-600 hover:bg-surface-100 rounded-md">Cancelar</button>
              <button type="submit" disabled={uploading || !selectedFile} className="px-4 py-2 text-xs bg-surface-800 text-white rounded-md hover:bg-surface-700 font-medium disabled:opacity-50">
                {uploading ? "Subiendo..." : "Subir"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal carga masiva */}
      {showBulk && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-lg mx-4 animate-fade-in-up max-h-[85vh] overflow-y-auto">
            <h2 className="text-base font-semibold text-surface-800 mb-1">Carga masiva de actas</h2>
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
          <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-sm mx-4 animate-fade-in-up">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-surface-800">Acta duplicada</h3>
                <p className="text-xs text-surface-500 mt-1">
                  Ya existe un acta con el nombre <strong className="text-surface-700">&quot;{dupConfirm.existing.nombre}&quot;</strong>
                </p>
                <div className="mt-2 text-[10px] text-surface-400 space-y-0.5">
                  <p>Archivo actual: {dupConfirm.existing.archivoNombre}</p>
                  <p>Tamaño: {formatSize(dupConfirm.existing.archivoSize)}</p>
                  <p>Subido: {new Date(dupConfirm.existing.createdAt).toLocaleDateString("es-MX")}</p>
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
    </div>
  );
}
