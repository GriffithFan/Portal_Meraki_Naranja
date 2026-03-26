"use client";
import { useRef, useState } from "react";
import { useNetworkContext } from "@/contexts/NetworkContext";
import { toast } from "sonner";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ExportableSectionProps {
  sectionName: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export default function ExportableSection({ sectionName, title, subtitle, children }: ExportableSectionProps) {
  const { selectedNetwork } = useNetworkContext();
  const [exporting, setExporting] = useState<"jpg" | "pdf" | null>(null);
  const sectionRef = useRef<HTMLDivElement>(null);

  const getFileName = (ext: string) => {
    const code = selectedNetwork?.predioCode || selectedNetwork?.name || selectedNetwork?.id || "export";
    return `${sectionName} ${code}.${ext}`;
  };

  const captureContent = async (): Promise<HTMLCanvasElement> => {
    const el = sectionRef.current;
    if (!el) throw new Error("Ref no disponible");

    // Import html2canvas
    const mod: any = await import("html2canvas");
    const h2c = mod.default ?? mod;
    if (typeof h2c !== "function") throw new Error("html2canvas no es función");

    // Ocultar botones durante captura
    const btns = el.querySelectorAll("[data-export-buttons]");
    btns.forEach((b) => ((b as HTMLElement).style.visibility = "hidden"));

    try {
      const canvas: HTMLCanvasElement = await h2c(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });
      if (!canvas || canvas.width === 0 || canvas.height === 0) {
        throw new Error(`Canvas vacío (${canvas?.width}x${canvas?.height})`);
      }

      // Agregar padding blanco
      const pad = 48;
      const padded = document.createElement("canvas");
      padded.width = canvas.width + pad * 2;
      padded.height = canvas.height + pad * 2;
      const ctx = padded.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear contexto 2D");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, padded.width, padded.height);
      ctx.drawImage(canvas, pad, pad);
      return padded;
    } finally {
      btns.forEach((b) => ((b as HTMLElement).style.visibility = ""));
    }
  };

  const downloadJPG = async () => {
    setExporting("jpg");
    try {
      const canvas = await captureContent();

      // Intentar toBlob directamente
      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((res) =>
          canvas.toBlob((b) => res(b), "image/jpeg", 0.92)
        );
      } catch {
        // Canvas tainted: redibujar pixel a pixel en canvas limpio
        const w = canvas.width, h = canvas.height;
        const srcCtx = canvas.getContext("2d");
        if (!srcCtx) throw new Error("No ctx src");
        const pixels = srcCtx.getImageData(0, 0, w, h);
        const clean = document.createElement("canvas");
        clean.width = w;
        clean.height = h;
        const cCtx = clean.getContext("2d")!;
        cCtx.putImageData(pixels, 0, 0);
        blob = await new Promise<Blob | null>((res) =>
          clean.toBlob((b) => res(b), "image/jpeg", 0.92)
        );
      }

      if (!blob) throw new Error("Blob nulo");

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFileName("jpg");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("JPG descargado");
    } catch (e: any) {
      console.error("[Export JPG]", e);
      toast.error(`Error JPG: ${e?.message || e}`);
    } finally {
      setExporting(null);
    }
  };

  const downloadPDF = async () => {
    setExporting("pdf");
    try {
      const canvas = await captureContent();

      let imgData: string;
      try {
        imgData = canvas.toDataURL("image/jpeg", 0.92);
      } catch {
        // Canvas tainted: fallback
        const w = canvas.width, h = canvas.height;
        const srcCtx = canvas.getContext("2d");
        if (!srcCtx) throw new Error("No ctx src");
        const pixels = srcCtx.getImageData(0, 0, w, h);
        const clean = document.createElement("canvas");
        clean.width = w;
        clean.height = h;
        const cCtx = clean.getContext("2d")!;
        cCtx.putImageData(pixels, 0, 0);
        imgData = clean.toDataURL("image/jpeg", 0.92);
      }

      const { jsPDF } = await import("jspdf");
      const margin = 40;
      const pdfW = canvas.width + margin * 2;
      const pdfH = canvas.height + margin * 2;
      const pdf = new jsPDF({
        orientation: pdfW > pdfH ? "landscape" : "portrait",
        unit: "px",
        format: [pdfW, pdfH],
      });
      pdf.addImage(imgData, "JPEG", margin, margin, canvas.width, canvas.height);
      pdf.save(getFileName("pdf"));
      toast.success("PDF descargado");
    } catch (e: any) {
      console.error("[Export PDF]", e);
      toast.error(`Error PDF: ${e?.message || e}`);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div ref={sectionRef}>
      {/* Header: título a la izquierda, botones a la derecha */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-surface-800 mb-1">{title}</h1>
          {subtitle && <p className="text-xs text-surface-400">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0" data-export-buttons>
          <button
            onClick={downloadJPG}
            disabled={!!exporting}
            title="Descargar como JPG"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exporting === "jpg" ? "Exportando..." : "JPG"}
          </button>
          <button
            onClick={downloadPDF}
            disabled={!!exporting}
            title="Descargar como PDF"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            {exporting === "pdf" ? "Exportando..." : "PDF"}
          </button>
        </div>
      </div>

      {/* Contenido */}
      {children}
    </div>
  );
}
