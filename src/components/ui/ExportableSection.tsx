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
    await new Promise<void>((r) => setTimeout(r, 100));
    return html2canvas(contentRef.current, {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      backgroundColor: "#ffffff",
      logging: false,
      removeContainer: true,
      imageTimeout: 0,
      onclone: (clonedDoc) => {
        clonedDoc.querySelectorAll("svg").forEach((svg) => {
          svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
          try {
            const bbox = (svg as SVGSVGElement).getBBox();
            if (!svg.hasAttribute("width")) svg.setAttribute("width", String(bbox.width));
            if (!svg.hasAttribute("height")) svg.setAttribute("height", String(bbox.height));
          } catch { /* ignore */ }
        });
      },
    });
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
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "JPEG", 0, 0, canvas.width, canvas.height);
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
