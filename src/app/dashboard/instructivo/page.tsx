"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { toast } from "sonner";
import { usePermisos } from "@/hooks/usePermisos";

interface Instructivo {
  id: string;
  titulo: string;
  contenido: string | null;
  videoUrl: string | null;
  videoNombre: string | null;
  videoRuta: string | null;
  videoTipo: string | null;
  videoSize: number | null;
  imagenNombre: string | null;
  imagenRuta: string | null;
  imagenTipo: string | null;
  imagenSize: number | null;
  pdfNombre: string | null;
  pdfRuta: string | null;
  pdfTipo: string | null;
  pdfSize: number | null;
  categoria: string;
  orden: number;
  activo: boolean;
  createdAt: string;
  creador: { id: string; nombre: string };
}

const CATEGORIAS = ["General", "Redes", "Switches", "Access Points", "Seguridad", "Procedimientos"];

/** Extract YouTube video ID from various URL formats */
function extractYouTubeId(url: string): string | null {
  if (!url) return null;
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/,
  ];
  for (const p of patterns) {
    const match = url.match(p);
    if (match) return match[1];
  }
  return null;
}

function isYouTubeUrl(url: string | null): boolean {
  if (!url) return false;
  return /youtube\.com|youtu\.be/i.test(url);
}

export default function InstructivoPage() {
  const [instructivos, setInstructivos] = useState<Instructivo[]>([]);
  const [selected, setSelected] = useState<Instructivo | null>(null);
  const urlParamsRef = useRef<URLSearchParams | null>(null);
  if (typeof window !== "undefined" && !urlParamsRef.current) {
    urlParamsRef.current = new URLSearchParams(window.location.search);
  }
  const [search, setSearch] = useState(() => urlParamsRef.current?.get("search") || "");
  const [filtroCategoria, setFiltroCategoria] = useState("Todas");
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<Instructivo | null>(null);
  const [userRol, setUserRol] = useState("");
  const [imagenExpandida, setImagenExpandida] = useState<string | null>(null);

  const fetchInstructivos = useCallback(async () => {
    try {
      setLoading(true);
      const params = filtroCategoria !== "Todas" ? `?categoria=${encodeURIComponent(filtroCategoria)}` : "";
      const res = await fetch(`/api/instructivos${params}`);
      if (res.ok) {
        const data = await res.json();
        setInstructivos(data.instructivos);
      }
    } catch (err) {
      console.error("Error cargando instructivos:", err);
    } finally {
      setLoading(false);
    }
  }, [filtroCategoria]);

  useEffect(() => {
    fetchInstructivos();
  }, [fetchInstructivos]);

  useEffect(() => {
    fetch("/api/auth/me").then(r => r.ok ? r.json() : null).then(d => {
      const rol = d?.user?.rol || d?.rol;
      if (rol) setUserRol(rol);
    }).catch(() => {});
  }, []);

  const { puedeEditar } = usePermisos();
  const canEdit = userRol === "ADMIN" || userRol === "MODERADOR" || puedeEditar("instructivo");

  const instructivosFiltrados = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return instructivos;
    return instructivos.filter((inst) => [inst.titulo, inst.contenido, inst.categoria, inst.videoNombre, inst.pdfNombre]
      .some((value) => String(value || "").toLowerCase().includes(q)));
  }, [instructivos, search]);

  const handleDelete = async (id: string) => {
    toast("¿Eliminar este instructivo?", {
      action: {
        label: "Eliminar",
        onClick: async () => {
          const res = await fetch(`/api/instructivos/${id}`, { method: "DELETE" });
          if (res.ok) {
            setInstructivos(prev => prev.filter(i => i.id !== id));
            if (selected?.id === id) setSelected(null);
            toast.success("Instructivo eliminado");
          } else {
            toast.error("Error al eliminar");
          }
        },
      },
    });
  };

  const handleEdit = (inst: Instructivo) => {
    setEditando(inst);
    setShowForm(true);
  };

  const handleFormSuccess = () => {
    setShowForm(false);
    setEditando(null);
    fetchInstructivos();
  };

  const getVideoSrc = (inst: Instructivo) => {
    if (inst.videoRuta) {
      const filename = inst.videoRuta.split("/").pop();
      return `/api/instructivos/video/${filename}`;
    }
    if (inst.videoUrl) return inst.videoUrl;
    return null;
  };

  const getImagenSrc = (inst: Instructivo) => {
    if (inst.imagenRuta) {
      const filename = inst.imagenRuta.split("/").pop();
      return `/api/instructivos/video/${filename}`;
    }
    return null;
  };

  const getPdfSrc = (inst: Instructivo) => {
    if (inst.pdfRuta) {
      const filename = inst.pdfRuta.split("/").pop();
      return `/api/instructivos/video/${filename}`;
    }
    return null;
  };

  return (
    <div className="animate-fade-in-up">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 mb-1">Instructivos</h1>
          <p className="text-xs text-surface-400">Guías, manuales y videos de procedimientos técnicos</p>
        </div>
        {canEdit && (
          <button
            onClick={() => { setEditando(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary-600 text-white rounded-lg text-xs font-medium hover:bg-primary-700 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Nuevo instructivo
          </button>
        )}
      </div>

      {/* Filtro por categorías */}
      <div className="flex flex-col sm:flex-row gap-2 mb-4">
        <input
          type="text"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar instructivo..."
          className="flex-1 min-w-0 px-3 py-1.5 border border-surface-200 rounded-lg text-sm sm:text-xs focus:outline-none focus:border-surface-400"
        />
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        {["Todas", ...CATEGORIAS].map(cat => (
          <button
            key={cat}
            onClick={() => setFiltroCategoria(cat)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
              filtroCategoria === cat
                ? "bg-primary-100 text-primary-700 ring-1 ring-primary-300"
                : "bg-surface-100 text-surface-500 hover:bg-surface-200"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Modal formulario */}
      {showForm && (
        <InstructivoForm
          editando={editando}
          onClose={() => { setShowForm(false); setEditando(null); }}
          onSuccess={handleFormSuccess}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-6 h-6 border-2 border-primary-300 border-t-primary-600 rounded-full animate-spin" />
        </div>
      ) : instructivosFiltrados.length === 0 ? (
        <div className="bg-white rounded-lg border border-surface-200 p-6">
          <div className="flex flex-col items-center justify-center py-16 text-surface-400">
            <svg className="w-16 h-16 mb-4 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
            </svg>
            <p className="text-sm font-medium text-surface-500 mb-2">Sin instructivos</p>
            <p className="text-xs">No hay instructivos disponibles{search ? ` para "${search}"` : filtroCategoria !== "Todas" ? ` en "${filtroCategoria}"` : ""}.</p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Lista lateral */}
          <div className="lg:col-span-1 space-y-2 max-h-[50vh] lg:max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
            {instructivosFiltrados.map(inst => (
              <button
                key={inst.id}
                onClick={() => setSelected(inst)}
                className={`w-full text-left p-3 rounded-lg border transition-all ${
                  selected?.id === inst.id
                    ? "bg-primary-50 border-primary-300 ring-1 ring-primary-200"
                    : "bg-white border-surface-200 hover:border-surface-300 hover:shadow-sm"
                }`}
              >
                <div className="flex items-start gap-2">
                  <div className={`mt-0.5 w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    inst.videoRuta || inst.videoUrl ? "bg-orange-100 text-orange-600" : inst.pdfRuta ? "bg-rose-100 text-rose-600" : inst.imagenRuta ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"
                  }`}>
                    {inst.videoRuta || inst.videoUrl ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                      </svg>
                    ) : inst.pdfRuta ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    ) : inst.imagenRuta ? (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                      </svg>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-surface-800 truncate">{inst.titulo}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-[10px] px-1.5 py-0.5 bg-surface-100 text-surface-500 rounded">{inst.categoria}</span>
                      {inst.videoRuta && (
                        <span className="text-[10px] text-orange-500">
                          {formatFileSize(inst.videoSize)}
                        </span>
                      )}
                      {inst.imagenRuta && (
                        <span className="text-[10px] text-emerald-500">
                          {formatFileSize(inst.imagenSize)}
                        </span>
                      )}
                      {inst.pdfRuta && (
                        <span className="text-[10px] text-rose-500">
                          PDF · {formatFileSize(inst.pdfSize)}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Visor principal */}
          <div className="lg:col-span-2">
            {selected ? (
              <div className="bg-white rounded-lg border border-surface-200 overflow-hidden">
                {/* Header del instructivo */}
                <div className="p-4 border-b border-surface-100 flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-surface-800">{selected.titulo}</h2>
                    <div className="flex items-center gap-3 mt-1">
                      <span className="text-[10px] px-2 py-0.5 bg-primary-50 text-primary-600 rounded-full font-medium">{selected.categoria}</span>
                      <span className="text-xs text-surface-400">
                        por {selected.creador.nombre} · {new Date(selected.createdAt).toLocaleDateString("es-CL")}
                      </span>
                    </div>
                  </div>
                  {canEdit && (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleEdit(selected)}
                        className="p-1.5 text-surface-400 hover:text-primary-600 hover:bg-primary-50 rounded transition-colors"
                        title="Editar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => handleDelete(selected.id)}
                        className="p-1.5 text-surface-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                        title="Eliminar"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>

                {/* Reproductor de video */}
                {getVideoSrc(selected) && !isYouTubeUrl(selected.videoUrl) && (
                  <div className="bg-black">
                    <video
                      key={selected.id}
                      controls
                      controlsList="nodownload"
                      className="w-full max-h-[420px]"
                      preload="metadata"
                    >
                      <source src={getVideoSrc(selected)!} type={selected.videoTipo || "video/mp4"} />
                      Tu navegador no soporta la reproducción de video.
                    </video>
                  </div>
                )}

                {/* YouTube embed */}
                {isYouTubeUrl(selected.videoUrl) && (() => {
                  const ytId = extractYouTubeId(selected.videoUrl!);
                  return ytId ? (
                    <div className="bg-black">
                      <div className="relative w-full" style={{ paddingBottom: "56.25%" }}>
                        <iframe
                          className="absolute inset-0 w-full h-full"
                          src={`https://www.youtube-nocookie.com/embed/${ytId}`}
                          title={selected.titulo}
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                          referrerPolicy="strict-origin-when-cross-origin"
                        />
                      </div>
                    </div>
                  ) : null;
                })()}

                {/* Visor de imagen */}
                {getImagenSrc(selected) && (
                  <div className="p-4 flex justify-center bg-surface-50">
                    <img
                      src={getImagenSrc(selected)!}
                      alt={selected.titulo}
                      className="max-w-full max-h-[600px] object-contain rounded-lg cursor-zoom-in"
                      onClick={() => setImagenExpandida(getImagenSrc(selected))}
                    />
                  </div>
                )}

                {/* Visor de PDF */}
                {getPdfSrc(selected) && (
                  <div className="p-2 sm:p-4 bg-surface-50">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                        </svg>
                        <span className="text-sm font-medium text-surface-700 truncate">{selected.pdfNombre}</span>
                        <span className="text-[10px] text-surface-400 flex-shrink-0">{formatFileSize(selected.pdfSize)}</span>
                      </div>
                      <a
                        href={`${getPdfSrc(selected)}?download=1`}
                        className="flex items-center justify-center gap-1 px-3 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-medium hover:bg-rose-700 transition-colors flex-shrink-0"
                        download
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                        Descargar PDF
                      </a>
                    </div>
                    <iframe
                      src={getPdfSrc(selected)!}
                      className="w-full rounded-lg border border-surface-200 h-[70vh] sm:h-[80vh]"
                      title={`PDF: ${selected.titulo}`}
                    />
                  </div>
                )}

                {/* Contenido de texto */}
                {selected.contenido && (
                  <div className="p-4">
                    <div className="prose prose-sm max-w-none text-surface-700 whitespace-pre-wrap">
                      {selected.contenido}
                    </div>
                  </div>
                )}

                {/* Si no tiene ni video, ni imagen, ni contenido */}
                {!getVideoSrc(selected) && !isYouTubeUrl(selected.videoUrl) && !getImagenSrc(selected) && !getPdfSrc(selected) && !selected.contenido && (
                  <div className="p-8 text-center text-surface-400">
                    <p className="text-sm">Este instructivo aún no tiene contenido.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-lg border border-surface-200 p-6">
                <div className="flex flex-col items-center justify-center py-16 text-surface-400">
                  <svg className="w-12 h-12 mb-3 text-surface-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59" />
                  </svg>
                  <p className="text-sm font-medium text-surface-500">Selecciona un instructivo</p>
                  <p className="text-xs mt-1">Elige uno de la lista para ver su contenido o video.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal fullscreen para imagen expandida */}
      {imagenExpandida && (
        <div
          className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
          onClick={() => setImagenExpandida(null)}
        >
          <button
            className="absolute top-4 right-4 z-10 text-white/80 hover:text-white bg-black/40 rounded-full p-2"
            onClick={() => setImagenExpandida(null)}
            aria-label="Cerrar"
          >
            <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
          <img
            src={imagenExpandida}
            alt="Imagen expandida"
            className="max-w-[100vw] max-h-[100vh] object-contain select-none"
            style={{ touchAction: "pinch-zoom" }}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}

/* ─── Formulario de Crear/Editar ─────────────────────────────── */

function InstructivoForm({
  editando,
  onClose,
  onSuccess,
}: {
  editando: Instructivo | null;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [titulo, setTitulo] = useState(editando?.titulo || "");
  const [contenido, setContenido] = useState(editando?.contenido || "");
  const [categoria, setCategoria] = useState(editando?.categoria || "General");
  const [orden, setOrden] = useState(editando?.orden || 0);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [imagenFile, setImagenFile] = useState<File | null>(null);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [youtubeUrl, setYoutubeUrl] = useState(editando?.videoUrl && isYouTubeUrl(editando.videoUrl) ? editando.videoUrl : "");
  const [removeVideo, setRemoveVideo] = useState(false);
  const [removeImagen, setRemoveImagen] = useState(false);
  const [removePdf, setRemovePdf] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imagenInputRef = useRef<HTMLInputElement>(null);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim()) { setError("El título es requerido"); return; }

    setSubmitting(true);
    setError("");

    const formData = new FormData();
    formData.append("titulo", titulo.trim());
    formData.append("contenido", contenido);
    formData.append("categoria", categoria);
    formData.append("orden", String(orden));
    if (videoFile) formData.append("video", videoFile);
    if (imagenFile) formData.append("imagen", imagenFile);
    if (pdfFile) formData.append("pdf", pdfFile);
    if (removeVideo) formData.append("removeVideo", "true");
    if (removeImagen) formData.append("removeImagen", "true");
    if (removePdf) formData.append("removePdf", "true");
    if (youtubeUrl.trim()) formData.append("youtubeUrl", youtubeUrl.trim());

    try {
      // Use XMLHttpRequest for upload progress
      const url = editando ? `/api/instructivos/${editando.id}` : "/api/instructivos";
      const method = editando ? "PUT" : "POST";

      const res = await new Promise<{ ok: boolean; status: number; data: unknown }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        };

        xhr.onload = () => {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve({ ok: xhr.status >= 200 && xhr.status < 300, status: xhr.status, data });
          } catch {
            resolve({ ok: false, status: xhr.status, data: { error: "Error inesperado" } });
          }
        };

        xhr.onerror = () => reject(new Error("Error de red"));
        xhr.send(formData);
      });

      if (!res.ok) {
        setError((res.data as { error?: string })?.error || "Error al guardar");
        return;
      }

      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSubmitting(false);
      setUploadProgress(0);
    }
  };

  const handleVideoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 200 * 1024 * 1024) {
      setError("El video no puede superar 200MB");
      return;
    }

    const allowed = /\.(mp4|webm|ogg)$/i;
    if (!allowed.test(file.name)) {
      setError("Solo se permiten videos MP4, WebM u OGG");
      return;
    }

    setVideoFile(file);
    setRemoveVideo(false);
    setError("");
  };

  const handleImagenSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 25 * 1024 * 1024) {
      setError("La imagen no puede superar 25MB");
      return;
    }

    const allowed = /\.(jpg|jpeg|png|webp|gif)$/i;
    if (!allowed.test(file.name)) {
      setError("Solo se permiten imágenes JPG, PNG, WebP o GIF");
      return;
    }

    setImagenFile(file);
    setRemoveImagen(false);
    setError("");
  };

  const handlePdfSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 50 * 1024 * 1024) {
      setError("El PDF no puede superar 50MB");
      return;
    }

    if (!/\.pdf$/i.test(file.name)) {
      setError("Solo se permiten archivos PDF");
      return;
    }

    setPdfFile(file);
    setRemovePdf(false);
    setError("");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-4 border-b border-surface-100 flex items-center justify-between">
          <h3 className="font-semibold text-surface-800">
            {editando ? "Editar instructivo" : "Nuevo instructivo"}
          </h3>
          <button onClick={onClose} className="p-1 text-surface-400 hover:text-surface-600 rounded">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {error && (
            <div className="p-2 bg-red-50 text-red-600 rounded text-xs">{error}</div>
          )}

          {/* Título */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Título *</label>
            <input
              type="text"
              value={titulo}
              onChange={e => setTitulo(e.target.value)}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
              placeholder="Nombre del instructivo"
              maxLength={200}
            />
          </div>

          {/* Categoría y Orden */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Categoría</label>
              <select
                value={categoria}
                onChange={e => setCategoria(e.target.value)}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                {CATEGORIAS.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-surface-600 mb-1">Orden</label>
              <input
                type="number"
                value={orden}
                onChange={e => setOrden(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300"
                min={0}
              />
            </div>
          </div>

          {/* Contenido de texto */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Contenido (texto del manual)</label>
            <textarea
              value={contenido}
              onChange={e => setContenido(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 resize-y"
              placeholder="Escribe aquí las instrucciones, pasos o descripción del procedimiento..."
            />
          </div>

          {/* Upload de video */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Video (MP4, WebM, OGG — máx 200MB)</label>
            
            {/* Video actual si existe */}
            {editando?.videoRuta && !removeVideo && !videoFile && (
              <div className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-orange-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z M15.91 11.672a.375.375 0 010 .656l-5.603 3.113a.375.375 0 01-.557-.328V8.887c0-.286.307-.466.557-.327l5.603 3.112z" />
                </svg>
                <span className="text-xs text-surface-600 truncate flex-1">{editando.videoNombre}</span>
                <button
                  type="button"
                  onClick={() => setRemoveVideo(true)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            )}

            {/* Nuevo archivo seleccionado */}
            {videoFile && (
              <div className="flex items-center gap-2 p-2 bg-primary-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-primary-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs text-primary-700 truncate flex-1">{videoFile.name} ({formatFileSize(videoFile.size)})</span>
                <button
                  type="button"
                  onClick={() => { setVideoFile(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/ogg,.mp4,.webm,.ogg"
              onChange={handleVideoSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-xs text-surface-500 hover:border-primary-400 hover:text-primary-600 hover:bg-primary-50/30 transition-colors"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                {videoFile ? "Cambiar video" : "Seleccionar video"}
              </span>
            </button>
          </div>

          {/* YouTube URL */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">
              URL de YouTube (alternativa al video local)
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={youtubeUrl}
                onChange={e => {
                  setYoutubeUrl(e.target.value);
                  if (e.target.value.trim()) {
                    setVideoFile(null);
                    setRemoveVideo(true);
                    if (fileInputRef.current) fileInputRef.current.value = "";
                  }
                }}
                className="flex-1 px-3 py-2 border border-surface-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-300 focus:border-primary-300"
                placeholder="https://www.youtube.com/watch?v=..."
              />
              {youtubeUrl && (
                <button
                  type="button"
                  onClick={() => setYoutubeUrl("")}
                  className="px-2 text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              )}
            </div>
            {youtubeUrl && extractYouTubeId(youtubeUrl) && (
              <p className="text-[10px] text-emerald-600 mt-1 flex items-center gap-1">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                </svg>
                URL de YouTube válida
              </p>
            )}
            {youtubeUrl && !extractYouTubeId(youtubeUrl) && (
              <p className="text-[10px] text-amber-600 mt-1">
                No se pudo extraer el ID del video. Verifica la URL.
              </p>
            )}
          </div>

          {/* Upload de imagen */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Imagen (JPG, PNG, WebP, GIF — máx 25MB)</label>
            
            {/* Imagen actual si existe */}
            {editando?.imagenRuta && !removeImagen && !imagenFile && (
              <div className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
                </svg>
                <span className="text-xs text-surface-600 truncate flex-1">{editando.imagenNombre}</span>
                <button
                  type="button"
                  onClick={() => setRemoveImagen(true)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            )}

            {/* Nueva imagen seleccionada */}
            {imagenFile && (
              <div className="flex items-center gap-2 p-2 bg-emerald-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-emerald-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
                </svg>
                <span className="text-xs text-emerald-700 truncate flex-1">{imagenFile.name} ({formatFileSize(imagenFile.size)})</span>
                <button
                  type="button"
                  onClick={() => { setImagenFile(null); if (imagenInputRef.current) imagenInputRef.current.value = ""; }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              </div>
            )}

            <input
              ref={imagenInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,.jpg,.jpeg,.png,.webp,.gif"
              onChange={handleImagenSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => imagenInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-xs text-surface-500 hover:border-emerald-400 hover:text-emerald-600 hover:bg-emerald-50/30 transition-colors"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 15.75 5.159-5.159a2.25 2.25 0 0 1 3.182 0l5.159 5.159m-1.5-1.5 1.409-1.409a2.25 2.25 0 0 1 3.182 0l2.909 2.909M3.75 21h16.5A2.25 2.25 0 0 0 22.5 18.75V5.25A2.25 2.25 0 0 0 20.25 3H3.75A2.25 2.25 0 0 0 1.5 5.25v13.5A2.25 2.25 0 0 0 3.75 21z" />
                </svg>
                {imagenFile ? "Cambiar imagen" : "Seleccionar imagen"}
              </span>
            </button>
          </div>

          {/* Upload de PDF */}
          <div>
            <label className="block text-xs font-medium text-surface-600 mb-1">Documento PDF (máx 50MB)</label>
            
            {/* PDF actual si existe */}
            {editando?.pdfRuta && !removePdf && !pdfFile && (
              <div className="flex items-center gap-2 p-2 bg-surface-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                <span className="text-xs text-surface-600 truncate flex-1">{editando.pdfNombre}</span>
                <button
                  type="button"
                  onClick={() => setRemovePdf(true)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Eliminar
                </button>
              </div>
            )}

            {/* Nuevo PDF seleccionado */}
            {pdfFile && (
              <div className="flex items-center gap-2 p-2 bg-rose-50 rounded-lg mb-2">
                <svg className="w-4 h-4 text-rose-500 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <span className="text-xs text-rose-700 truncate flex-1">{pdfFile.name} ({formatFileSize(pdfFile.size)})</span>
                <button
                  type="button"
                  onClick={() => { setPdfFile(null); if (pdfInputRef.current) pdfInputRef.current.value = ""; }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Quitar
                </button>
              </div>
            )}

            <input
              ref={pdfInputRef}
              type="file"
              accept="application/pdf,.pdf"
              onChange={handlePdfSelect}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => pdfInputRef.current?.click()}
              className="w-full py-3 border-2 border-dashed border-surface-300 rounded-lg text-xs text-surface-500 hover:border-rose-400 hover:text-rose-600 hover:bg-rose-50/30 transition-colors"
            >
              <span className="flex items-center justify-center gap-1.5">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m.75 12 3 3m0 0 3-3m-3 3v-6m-1.5-9H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                </svg>
                {pdfFile ? "Cambiar PDF" : "Seleccionar PDF"}
              </span>
            </button>
          </div>

          {/* Barra de progreso */}
          {submitting && uploadProgress > 0 && uploadProgress < 100 && (
            <div>
              <div className="flex justify-between text-[10px] text-surface-500 mb-1">
                <span>Subiendo archivo...</span>
                <span>{uploadProgress}%</span>
              </div>
              <div className="h-1.5 bg-surface-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary-500 rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-3 py-2 border border-surface-200 text-surface-600 rounded-lg text-sm hover:bg-surface-50 transition-colors"
              disabled={submitting}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 px-3 py-2 bg-primary-600 text-white rounded-lg text-sm font-medium hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              {submitting ? "Guardando..." : editando ? "Actualizar" : "Crear"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ─── Utilidades ─────────────────────────────────────────────── */

function formatFileSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
