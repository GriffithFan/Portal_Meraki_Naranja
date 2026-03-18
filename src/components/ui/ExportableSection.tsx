"use client";
import { useRef, useState } from "react";
import { useNetworkContext } from "@/contexts/NetworkContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface ExportableSectionProps {
  sectionName: string;
  children: React.ReactNode;
}

export default function ExportableSection({ sectionName, children }: ExportableSectionProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  const { selectedNetwork } = useNetworkContext();
  const [exporting, setExporting] = useState<"jpg" | "pdf" | null>(null);

  const getFileName = (ext: string) => {
    const code = selectedNetwork?.predioCode || selectedNetwork?.name || selectedNetwork?.id || "export";
    return `${sectionName} ${code}.${ext}`;
  };

  const captureSection = async () => {
    if (!contentRef.current) return null;
    const html2canvas = (await import("html2canvas")).default;
    const raw = await html2canvas(contentRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      removeContainer: true,
      imageTimeout: 0,
      scrollX: 0,
      scrollY: 0,
      onclone: (clonedDoc: Document, clonedEl: HTMLElement) => {
        // Forzar posición fija para evitar offset por scroll
        clonedEl.style.position = "fixed";
        clonedEl.style.top = "0";
        clonedEl.style.left = "0";
        clonedEl.style.margin = "0";
        clonedDoc.querySelectorAll("svg").forEach((svg) => {
          svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
        });
      },
    });
    // Crear canvas con márgenes blancos alrededor
    const pad = 48;
    const padded = document.createElement("canvas");
    padded.width = raw.width + pad * 2;
    padded.height = raw.height + pad * 2;
    const ctx = padded.getContext("2d")!;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, padded.width, padded.height);
    ctx.drawImage(raw, pad, pad);
    return padded;
  };

  const downloadJPG = async () => {
    setExporting("jpg");
    try {
      const canvas = await captureSection();
      if (!canvas) return;
      canvas.toBlob((blob) => {
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = getFileName("jpg");
        a.click();
        URL.revokeObjectURL(url);
      }, "image/jpeg", 0.95);
    } catch (e) {
      console.error("Error capturando imagen:", e);
    } finally {
      setExporting(null);
    }
  };

  const downloadPDF = async () => {
    setExporting("pdf");
    try {
      const canvas = await captureSection();
      if (!canvas) return;
      const imgData = canvas.toDataURL("image/jpeg", 0.95);
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
    } catch (e) {
      console.error("Error generando PDF:", e);
    } finally {
      setExporting(null);
    }
  };

  return (
    <div>
      {/* Botones de exportación */}
      <div className="flex items-center gap-2 mb-4">
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

      {/* Contenido capturado */}
      <div ref={contentRef}>
        {children}
      </div>
    </div>
  );
}
