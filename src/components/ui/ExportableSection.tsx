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

  const captureMainContent = async (): Promise<HTMLCanvasElement | null> => {
    const mainEl = document.querySelector("main");
    if (!mainEl) {
      console.error("[Export] No se encontró elemento <main>");
      return null;
    }

    // Importar html2canvas defensivamente (CJS y ESM)
    let h2c: any;
    try {
      const mod: any = await import("html2canvas");
      h2c = typeof mod.default === "function" ? mod.default : typeof mod === "function" ? mod : null;
      if (!h2c) {
        console.error("[Export] html2canvas import inválido:", Object.keys(mod));
        return null;
      }
    } catch (err) {
      console.error("[Export] Error importando html2canvas:", err);
      return null;
    }

    // Ocultar botones de export
    const btns = mainEl.querySelectorAll("[data-export-buttons]");
    btns.forEach((b: any) => (b.style.display = "none"));

    try {
      const raw: HTMLCanvasElement = await h2c(mainEl, {
        scale: 2,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
        removeContainer: true,
        imageTimeout: 5000,
      });

      if (!raw || raw.width === 0 || raw.height === 0) {
        console.error("[Export] Canvas vacío:", raw?.width, raw?.height);
        return null;
      }

      // Canvas con márgenes blancos
      const pad = 48;
      const padded = document.createElement("canvas");
      padded.width = raw.width + pad * 2;
      padded.height = raw.height + pad * 2;
      const ctx = padded.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, padded.width, padded.height);
      ctx.drawImage(raw, pad, pad);
      return padded;
    } catch (err) {
      console.error("[Export] Error en html2canvas:", err);
      return null;
    } finally {
      btns.forEach((b: any) => (b.style.display = ""));
    }
  };

  const downloadJPG = async () => {
    setExporting("jpg");
    try {
      const canvas = await captureMainContent();
      if (!canvas) {
        toast.error("No se pudo capturar la sección");
        return;
      }

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92);
      });

      if (!blob) {
        toast.error("Error al generar imagen");
        return;
      }

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
      console.error("[Export JPG] Error:", e?.message || e);
      toast.error("Error al exportar JPG");
    } finally {
      setExporting(null);
    }
  };

  const downloadPDF = async () => {
    setExporting("pdf");
    try {
      const canvas = await captureMainContent();
      if (!canvas) {
        toast.error("No se pudo capturar la sección");
        return;
      }

      const imgData = canvas.toDataURL("image/jpeg", 0.92);
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
      console.error("[Export PDF] Error:", e?.message || e);
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
