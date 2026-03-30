"use client";
import { useRef, useState } from "react";
import { useNetworkContext } from "@/contexts/NetworkContext";
import { toast } from "sonner";
import { toCanvas } from "html-to-image";

interface ExportableSectionProps {
  sectionName: string;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/* ─── Helpers para construir el layout de captura estilo auditoría ─── */

const NAV_ITEMS = [
  { label: "Topología", key: "Topologia", icon: "topology" },
  { label: "Switches", key: "Switches", icon: "switches" },
  { label: "Puntos de acceso", key: "Access Points en Gigas", icon: "wifi" },
  { label: "Estado (appliances)", key: "Appliance Status", icon: "appliance" },
];

function navIconSVG(type: string, color: string): string {
  const c = color;
  switch (type) {
    case "topology":
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="8" x2="5" y2="16"/><line x1="12" y1="8" x2="19" y2="16"/></svg>`;
    case "switches":
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="7" rx="1"/><rect x="2" y="14" width="20" height="7" rx="1"/><circle cx="6" cy="6.5" r="1" fill="${c}"/><circle cx="6" cy="17.5" r="1" fill="${c}"/></svg>`;
    case "wifi":
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2.2" stroke-linecap="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/><path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="${c}"/></svg>`;
    case "appliance":
      return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>`;
    default:
      return "";
  }
}

/**
 * Construye un contenedor temporal en el DOM con el layout del proyecto
 * auditado (header oscuro + sidebar con info del predio + contenido).
 * Se usa solo durante la captura, luego se elimina.
 */
function buildCaptureLayout(
  contentEl: HTMLElement,
  sectionName: string,
  predioCode: string,
  networkId: string,
): HTMLElement {
  const now = new Date();
  const dateStr =
    now.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" }) +
    ", " +
    now.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

  // Leer GPS del sidebar (ya renderizado en el DOM)
  const sidebarText = document.querySelector("aside")?.textContent || "";
  const gpsMatch = sidebarText.match(/([\-]?\d+\.\d+),\s*([\-]?\d+\.\d+)/);
  const gpsText = gpsMatch ? `${gpsMatch[1]}, ${gpsMatch[2]}` : "";

  // Logo: leer URL resuelta del sidebar o construirla
  const logoImg = document.querySelector('img[alt="Carrot"]') as HTMLImageElement | null;
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
  const logoSrc = logoImg?.src || `${basePath}/images/logo-horizontal.png`;

  // Nav HTML
  const navHTML = NAV_ITEMS.map((item) => {
    const active = item.key === sectionName;
    const icon = navIconSVG(item.icon, active ? "#2563eb" : "#9ca3af");
    return `<div style="display:flex;align-items:center;gap:10px;padding:10px 14px;margin-bottom:2px;border-radius:8px;${active ? "background:#dbeafe;color:#2563eb;font-weight:600;" : "color:#6b7280;"};font-size:14px;">
      ${icon}<span>${item.label}</span></div>`;
  }).join("");

  // GPS block
  const gpsBlock = gpsText
    ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #f3f4f6;">
        <div style="display:flex;align-items:center;justify-content:center;gap:4px;font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
          Ubicación GPS
        </div>
        <div style="font-size:12px;color:#374151;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${gpsText}</div>
      </div>`
    : "";

  // Shell
  const shell = document.createElement("div");
  shell.style.cssText =
    "position:fixed;left:-9999px;top:0;width:1500px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#fff;";

  shell.innerHTML = `
    <!-- Header -->
    <div style="background:#1e3a5f;height:52px;display:flex;align-items:center;padding:0 20px;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="display:flex;align-items:center;gap:8px;">
          <div style="background:#f97316;width:30px;height:30px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:15px;">M</div>
          <span style="color:white;font-size:17px;font-weight:600;">Portal</span>
        </div>
        <div style="display:flex;align-items:center;margin-left:16px;">
          <div style="background:rgba(255,255,255,0.12);border:1px solid rgba(255,255,255,0.2);border-radius:6px 0 0 6px;height:34px;padding:0 14px;color:white;font-size:13px;width:320px;display:flex;align-items:center;">${predioCode}</div>
          <div style="background:#3b82f6;height:34px;width:38px;border-radius:0 6px 6px 0;display:flex;align-items:center;justify-content:center;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        <div style="border:1.5px solid rgba(255,255,255,0.3);border-radius:20px;padding:5px 16px;display:flex;align-items:center;height:34px;">
          <img src="${logoSrc}" style="height:22px;width:auto;object-fit:contain;" crossorigin="anonymous" />
        </div>
        <div style="display:flex;align-items:center;gap:6px;color:rgba(255,255,255,0.8);font-size:13px;font-weight:500;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Salir
        </div>
      </div>
    </div>
    <!-- Body -->
    <div style="display:flex;min-height:600px;">
      <!-- Sidebar -->
      <div style="width:210px;border-right:1px solid #e5e7eb;display:flex;flex-direction:column;flex-shrink:0;">
        <div style="padding:20px 16px 16px;border-bottom:1px solid #f3f4f6;">
          <div style="display:flex;align-items:start;justify-content:space-between;">
            <div>
              <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px;">Predio</div>
              <div style="font-size:22px;font-weight:700;color:#111827;line-height:1.2;">${predioCode}</div>
              <div style="font-size:10px;color:#9ca3af;margin-top:3px;word-break:break-all;line-height:1.3;">${networkId}</div>
            </div>
            <div style="width:26px;height:26px;border-radius:50%;border:1px solid #e5e7eb;display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:14px;flex-shrink:0;margin-top:2px;">‹</div>
          </div>
        </div>
        <div style="padding:12px 10px;flex:1;">${navHTML}</div>
        <div style="border-top:1px solid #f3f4f6;padding:16px;text-align:center;">
          <div style="font-size:10px;font-weight:600;color:#9ca3af;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">Fecha y Hora</div>
          <div style="font-size:13px;font-weight:600;color:#374151;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;">${dateStr}</div>
          ${gpsBlock}
        </div>
      </div>
      <!-- Content -->
      <div style="flex:1;padding:24px 28px;" data-capture-content></div>
    </div>
  `;

  // Clonar contenido y limpiar botones de export
  const clone = contentEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-buttons]").forEach((el) => el.remove());

  const contentArea = shell.querySelector("[data-capture-content]");
  if (contentArea) contentArea.appendChild(clone);

  document.body.appendChild(shell);
  return shell;
}

/* ─── Componente principal ─── */

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

    const predioCode = selectedNetwork?.predioCode || selectedNetwork?.name || "---";
    const networkId = selectedNetwork?.id || "";

    // Construir layout completo estilo auditoría
    const shell = buildCaptureLayout(el, sectionName, predioCode, networkId);

    try {
      const raw = await toCanvas(shell, {
        pixelRatio: 2,
        backgroundColor: "#ffffff",
        cacheBust: true,
      });

      if (!raw || raw.width === 0 || raw.height === 0) {
        throw new Error(`Canvas vacío (${raw?.width}x${raw?.height})`);
      }

      // Agregar padding blanco
      const pad = 48;
      const padded = document.createElement("canvas");
      padded.width = raw.width + pad * 2;
      padded.height = raw.height + pad * 2;
      const ctx = padded.getContext("2d");
      if (!ctx) throw new Error("No se pudo crear contexto 2D");
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, padded.width, padded.height);
      ctx.drawImage(raw, pad, pad);
      return padded;
    } finally {
      document.body.removeChild(shell);
    }
  };

  const downloadJPG = async () => {
    setExporting("jpg");
    try {
      const canvas = await captureContent();
      const blob = await new Promise<Blob | null>((res) =>
        canvas.toBlob((b) => res(b), "image/jpeg", 0.92)
      );
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Export JPG]", e);
      toast.error(`Error JPG: ${msg}`);
    } finally {
      setExporting(null);
    }
  };

  const downloadPDF = async () => {
    setExporting("pdf");
    try {
      const canvas = await captureContent();
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
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[Export PDF]", e);
      toast.error(`Error PDF: ${msg}`);
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
