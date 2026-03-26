"use client";
import { useState } from "react";
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

  const getFileName = (ext: string) => {
    const code = selectedNetwork?.predioCode || selectedNetwork?.name || selectedNetwork?.id || "export";
    return `${sectionName} ${code}.${ext}`;
  };

  const captureMainContent = async () => {
    const mainEl = document.querySelector("main");
    if (!mainEl) return null;
    const html2canvas = (await import("html2canvas")).default;

    // Ocultar botones de export durante la captura
    const exportBtns = mainEl.querySelector("[data-export-buttons]") as HTMLElement | null;
    if (exportBtns) exportBtns.style.display = "none";

    try {
      const raw = await html2canvas(mainEl, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
        imageTimeout: 15000,
        scrollX: 0,
        scrollY: 0,
        width: mainEl.scrollWidth,
        height: mainEl.scrollHeight,
        onclone: (clonedDoc: Document) => {
          // Ocultar botones en el clon también
          const clonedBtns = clonedDoc.querySelector("[data-export-buttons]") as HTMLElement | null;
          if (clonedBtns) clonedBtns.style.display = "none";
          clonedDoc.querySelectorAll("svg").forEach((svg) => {
            svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          });
        },
      });
      if (raw.width === 0 || raw.height === 0) return null;

      // Crear canvas con márgenes blancos
      const pad = 48;
      const padded = document.createElement("canvas");
      padded.width = raw.width + pad * 2;
      padded.height = raw.height + pad * 2;
      const ctx = padded.getContext("2d")!;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, padded.width, padded.height);
      ctx.drawImage(raw, pad, pad);
      return padded;
    } finally {
      if (exportBtns) exportBtns.style.display = "";
    }
  };

  const downloadJPG = async () => {
    setExporting("jpg");
    try {
      const canvas = await captureMainContent();
      if (!canvas) { toast.error("No se pudo capturar la sección"); return; }

      // Con allowTaint, toBlob puede fallar por SecurityError — usar fallback
      let blob: Blob | null = null;
      try {
        blob = await new Promise<Blob | null>((resolve) => {
          canvas.toBlob((b) => resolve(b), "image/jpeg", 0.95);
        });
      } catch {
        // Fallback: redibujar en canvas limpio
        const clean = document.createElement("canvas");
        clean.width = canvas.width;
        clean.height = canvas.height;
        const ctx = clean.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, clean.width, clean.height);
        const imgData = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        ctx.putImageData(imgData, 0, 0);
        blob = await new Promise<Blob | null>((resolve) => {
          clean.toBlob((b) => resolve(b), "image/jpeg", 0.95);
        });
      }

      if (!blob) { toast.error("Error al generar imagen"); return; }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = getFileName("jpg");
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("JPG descargado");
    } catch (e) {
      console.error("Error capturando imagen:", e);
      toast.error("Error al exportar JPG");
    } finally {
      setExporting(null);
    }
  };

  const downloadPDF = async () => {
    setExporting("pdf");
    try {
      const canvas = await captureMainContent();
      if (!canvas) { toast.error("No se pudo capturar la sección"); return; }

      let imgData: string;
      try {
        imgData = canvas.toDataURL("image/jpeg", 0.95);
      } catch {
        // Fallback
        const clean = document.createElement("canvas");
        clean.width = canvas.width;
        clean.height = canvas.height;
        const ctx = clean.getContext("2d")!;
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, clean.width, clean.height);
        const pixels = canvas.getContext("2d")!.getImageData(0, 0, canvas.width, canvas.height);
        ctx.putImageData(pixels, 0, 0);
        imgData = clean.toDataURL("image/jpeg", 0.95);
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
    } catch (e) {
      console.error("Error generando PDF:", e);
      toast.error("Error al exportar PDF");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
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
