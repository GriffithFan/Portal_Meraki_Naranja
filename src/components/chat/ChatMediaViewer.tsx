"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Tool = "draw" | "erase" | "crop" | "mover";

type CropBox = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

const MAX_CANVAS_SIDE = 1600;
const COLORS = ["#ef4444", "#f59e0b", "#22c55e", "#3b82f6", "#111827", "#ffffff"];
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function pointerPosition(canvas: HTMLCanvasElement, event: React.PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * (canvas.width / rect.width),
    y: (event.clientY - rect.top) * (canvas.height / rect.height),
  };
}

function normalizedCrop(crop: CropBox | null) {
  if (!crop) return null;
  const x = Math.min(crop.startX, crop.endX);
  const y = Math.min(crop.startY, crop.endY);
  const width = Math.abs(crop.endX - crop.startX);
  const height = Math.abs(crop.endY - crop.startY);
  if (width < 8 || height < 8) return null;
  return { x, y, width, height };
}

function clampZoom(value: number) {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Number(value.toFixed(2))));
}

export default function ChatMediaViewer({
  message,
  conversacionId,
  onClose,
  onSent,
  compact = false,
}: {
  message: any | null;
  conversacionId?: string;
  onClose: () => void;
  onSent?: () => void;
  compact?: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imageSrcRef = useRef<string>("");
  const drawingRef = useRef(false);
  const panRef = useRef({ panning: false, startX: 0, startY: 0, startPanX: 0, startPanY: 0 });
  const viewStateRef = useRef({ zoom: 1, pan: { x: 0, y: 0 } });
  const [tool, setTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#ef4444");
  const [strokeSize, setStrokeSize] = useState(6);
  const [crop, setCrop] = useState<CropBox | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const urls = useMemo(() => {
    if (!message?.id) return { downloadUrl: "", inlineUrl: "" };
    const downloadUrl = `/api/chat/archivo/${message.id}`;
    return { downloadUrl, inlineUrl: `${downloadUrl}?inline=true` };
  }, [message?.id]);

  const mime = (message?.archivoTipo || "").split(";")[0].trim();
  const isImage = mime.startsWith("image/");
  const isVideo = mime.startsWith("video/");
  const isAudio = mime.startsWith("audio/");

  const loadImage = useCallback(() => {
    if (!isImage || !urls.inlineUrl) return;
    setError("");
    setCrop(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    const img = new Image();
    img.onload = () => {
      const ratio = Math.min(1, MAX_CANVAS_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
      const width = Math.max(1, Math.round(img.naturalWidth * ratio));
      const height = Math.max(1, Math.round(img.naturalHeight * ratio));
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext("2d");
      if (!canvas || !ctx) return;
      canvas.width = width;
      canvas.height = height;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      setCanvasSize({ width, height });
    };
    img.onerror = () => setError("No se pudo abrir la imagen");
    img.src = urls.inlineUrl;
    imageSrcRef.current = urls.inlineUrl;
  }, [isImage, urls.inlineUrl]);

  useEffect(() => {
    loadImage();
  }, [loadImage]);

  useEffect(() => {
    if (!message) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [message, onClose]);

  // Espejo del zoom/pan actuales para que el listener nativo (abajo) lea el valor
  // vigente sin re-engancharse en cada cambio.
  useEffect(() => {
    viewStateRef.current = { zoom, pan };
  }, [zoom, pan]);

  // Zoom con Ctrl+rueda HACIA EL CURSOR. Se engancha NATIVO con { passive:false }
  // para poder hacer preventDefault y evitar que el navegador haga zoom a toda la
  // página (el onWheel de React es pasivo y no deja frenar el zoom del navegador).
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey) return;
      event.preventDefault();
      const { zoom: z, pan: pn } = viewStateRef.current;
      const z2 = clampZoom(z + (event.deltaY > 0 ? -0.25 : 0.25));
      if (z2 === z) return;
      if (z2 <= 1) { setZoom(z2); setPan({ x: 0, y: 0 }); return; }
      const rect = vp.getBoundingClientRect();
      const dx = event.clientX - (rect.left + rect.width / 2);
      const dy = event.clientY - (rect.top + rect.height / 2);
      setPan({ x: dx - (dx - pn.x) * (z2 / z), y: dy - (dy - pn.y) * (z2 / z) });
      setZoom(z2);
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [message?.id]);

  if (!message) return null;

  const handlePointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    // Herramienta "Mover": arrastrar para paneear la imagen ampliada (no dibuja).
    if (tool === "mover") {
      canvas.setPointerCapture(event.pointerId);
      panRef.current = { panning: true, startX: event.clientX, startY: event.clientY, startPanX: pan.x, startPanY: pan.y };
      return;
    }
    const point = pointerPosition(canvas, event);
    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    if (tool === "crop") {
      setCrop({ startX: point.x, startY: point.y, endX: point.x, endY: point.y });
      return;
    }
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (panRef.current.panning) {
      setPan({
        x: panRef.current.startPanX + (event.clientX - panRef.current.startX),
        y: panRef.current.startPanY + (event.clientY - panRef.current.startY),
      });
      return;
    }
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const point = pointerPosition(canvas, event);
    if (tool === "crop") {
      setCrop((current) => current ? { ...current, endX: point.x, endY: point.y } : current);
      return;
    }
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = strokeSize;
    ctx.globalCompositeOperation = tool === "erase" ? "destination-out" : "source-over";
    ctx.strokeStyle = color;
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  };

  const stopDrawing = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    if (panRef.current.panning) { panRef.current.panning = false; return; }
    drawingRef.current = false;
    const ctx = canvas?.getContext("2d");
    if (ctx) ctx.globalCompositeOperation = "source-over";
  };

  const applyCrop = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    const selected = normalizedCrop(crop);
    if (!canvas || !ctx || !selected) return;
    const temp = document.createElement("canvas");
    temp.width = Math.round(selected.width);
    temp.height = Math.round(selected.height);
    const tempCtx = temp.getContext("2d");
    if (!tempCtx) return;
    tempCtx.drawImage(canvas, selected.x, selected.y, selected.width, selected.height, 0, 0, temp.width, temp.height);
    canvas.width = temp.width;
    canvas.height = temp.height;
    ctx.drawImage(temp, 0, 0);
    setCanvasSize({ width: temp.width, height: temp.height });
    setCrop(null);
    setZoom(1);
    setPan({ x: 0, y: 0 });
    setTool("draw");
  };

  const changeZoom = (delta: number) => {
    setZoom((current) => {
      const next = clampZoom(current + delta);
      if (next <= 1) setPan({ x: 0, y: 0 });
      return next;
    });
  };

  const sendCorrection = async () => {
    if (!conversacionId || !message?.id) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSending(true);
    setError("");
    try {
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png", 0.95));
      if (!blob) throw new Error("No se pudo generar la imagen");
      const baseName = (message.archivoNombre || "imagen").replace(/\.[^.]+$/, "").slice(0, 80);
      const file = new File([blob], `correccion-${baseName || "imagen"}.png`, { type: "image/png" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("conversacionId", conversacionId);
      formData.append("replyToId", message.id);
      formData.append("mensaje", "Corrección de imagen");
      const res = await fetch("/api/chat/upload", { method: "POST", credentials: "include", body: formData });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Error al reenviar la corrección");
      }
      onSent?.();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al reenviar la corrección");
    } finally {
      setSending(false);
    }
  };

  const selectedCrop = normalizedCrop(crop);
  const cropStyle = selectedCrop && canvasSize.width && canvasSize.height ? {
    left: `${(selectedCrop.x / canvasSize.width) * 100}%`,
    top: `${(selectedCrop.y / canvasSize.height) * 100}%`,
    width: `${(selectedCrop.width / canvasSize.width) * 100}%`,
    height: `${(selectedCrop.height / canvasSize.height) * 100}%`,
  } : undefined;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-1 sm:p-3" role="dialog" aria-modal="true">
      <div className={clsx("flex max-h-[98vh] w-full flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-surface-900", compact ? "max-w-[98vw]" : "max-w-[92vw]")}>
        <div className="flex items-center justify-between gap-3 border-b border-surface-200 px-3 py-2 dark:border-surface-700">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-surface-800 dark:text-surface-100">{message.archivoNombre || "Archivo"}</p>
            <p className="text-[11px] text-surface-500 dark:text-surface-400">{mime || "archivo"} {message.archivoTamanio ? `· ${formatFileSize(message.archivoTamanio)}` : ""}</p>
          </div>
          <div className="flex items-center gap-1">
            <a href={urls.downloadUrl} download className="rounded-lg px-2 py-1 text-xs font-medium text-surface-600 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800">Descargar</a>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-surface-500 hover:bg-surface-100 dark:text-surface-300 dark:hover:bg-surface-800" title="Cerrar">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {isImage ? (
          <div className="flex min-h-0 flex-1 flex-col md:flex-row">
            <div ref={viewportRef} className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-surface-950 p-1 sm:p-3">
              <div
                className="relative inline-block max-h-full max-w-full"
                style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "center center", willChange: "transform" }}
              >
                <canvas
                  ref={canvasRef}
                  className={clsx("block max-h-[86vh] max-w-full touch-none rounded bg-white", tool === "crop" ? "cursor-crosshair" : tool === "mover" ? "cursor-grab active:cursor-grabbing" : "cursor-crosshair")}
                  onPointerDown={handlePointerDown}
                  onPointerMove={handlePointerMove}
                  onPointerUp={stopDrawing}
                  onPointerCancel={stopDrawing}
                />
                {cropStyle && <div className="pointer-events-none absolute border-2 border-blue-400 bg-blue-400/15" style={cropStyle} />}
              </div>
            </div>
            <div className="w-full space-y-3 border-t border-surface-200 p-3 dark:border-surface-700 md:w-72 md:border-l md:border-t-0">
              <div>
                <p className="mb-1 text-[11px] font-medium text-surface-500 dark:text-surface-400">Zoom {Math.round(zoom * 100)}% · <span className="text-surface-400">Ctrl+rueda</span></p>
                <div className="grid grid-cols-3 gap-1">
                  <button type="button" onClick={() => changeZoom(-0.25)} className="rounded-lg bg-surface-100 px-2 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 disabled:opacity-40 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700" disabled={zoom <= MIN_ZOOM}>-</button>
                  <button type="button" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} className="rounded-lg bg-surface-100 px-2 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700">100%</button>
                  <button type="button" onClick={() => changeZoom(0.25)} className="rounded-lg bg-surface-100 px-2 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 disabled:opacity-40 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700" disabled={zoom >= MAX_ZOOM}>+</button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-1">
                {(["draw", "erase", "crop", "mover"] as Tool[]).map((item) => (
                  <button key={item} type="button" onClick={() => setTool(item)} className={clsx("rounded-lg px-2 py-1.5 text-xs font-medium", tool === item ? "bg-blue-600 text-white" : "bg-surface-100 text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700")}>{item === "draw" ? "Dibujar" : item === "erase" ? "Borrar" : item === "crop" ? "Recortar" : "Mover"}</button>
                ))}
              </div>
              <div>
                <p className="mb-1 text-[11px] font-medium text-surface-500 dark:text-surface-400">Color</p>
                <div className="flex gap-1">
                  {COLORS.map((item) => (
                    <button key={item} type="button" onClick={() => setColor(item)} className={clsx("h-7 w-7 rounded-full border", color === item ? "ring-2 ring-blue-500 ring-offset-2 dark:ring-offset-surface-900" : "border-surface-300")} style={{ backgroundColor: item }} title={item} />
                  ))}
                </div>
              </div>
              <label className="block text-[11px] font-medium text-surface-500 dark:text-surface-400">
                Trazo {strokeSize}px
                <input type="range" min="2" max="32" value={strokeSize} onChange={(e) => setStrokeSize(Number(e.target.value))} className="mt-1 w-full" />
              </label>
              <div className="flex gap-2">
                <button type="button" onClick={loadImage} className="flex-1 rounded-lg bg-surface-100 px-2 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700">Restaurar</button>
                <button type="button" onClick={applyCrop} disabled={!selectedCrop} className="flex-1 rounded-lg bg-surface-100 px-2 py-1.5 text-xs font-medium text-surface-600 hover:bg-surface-200 disabled:opacity-40 dark:bg-surface-800 dark:text-surface-300 dark:hover:bg-surface-700">Aplicar recorte</button>
              </div>
              {error && <p className="rounded-lg bg-red-50 px-2 py-1.5 text-xs text-red-600 dark:bg-red-900/20 dark:text-red-300">{error}</p>}
              <button type="button" onClick={sendCorrection} disabled={sending || !conversacionId} className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                {sending ? "Enviando..." : "Reenviar corrección"}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex min-h-[320px] flex-1 items-center justify-center bg-surface-950 p-4">
            {isVideo ? <video src={urls.inlineUrl} controls playsInline className="max-h-[75vh] max-w-full rounded-lg" /> : null}
            {isAudio ? <audio src={urls.inlineUrl} controls className="w-full max-w-lg" /> : null}
            {!isVideo && !isAudio && (
              <div className="rounded-xl bg-white p-5 text-center shadow dark:bg-surface-800">
                <p className="text-sm font-semibold text-surface-800 dark:text-surface-100">{message.archivoNombre || "Archivo"}</p>
                <p className="mt-1 text-xs text-surface-500 dark:text-surface-400">Vista previa no disponible</p>
                <a href={urls.downloadUrl} download className="mt-4 inline-flex rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700">Descargar</a>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
