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

/* ─── SVG icon factories (match SidebarTopBar.details.jsx exactly) ─── */

function topologyIconSVG(c: string) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><circle cx="12" cy="3" r="1"></circle><circle cx="12" cy="21" r="1"></circle><circle cx="3" cy="12" r="1"></circle><circle cx="21" cy="12" r="1"></circle><line x1="12" y1="9" x2="12" y2="5"></line><line x1="12" y1="19" x2="12" y2="15"></line><line x1="9" y1="12" x2="5" y2="12"></line><line x1="19" y1="12" x2="15" y2="12"></line></svg>`;
}
function switchIconSVG(c: string) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"></rect><line x1="6" y1="11" x2="6.01" y2="11"></line><line x1="10" y1="11" x2="10.01" y2="11"></line><line x1="14" y1="11" x2="14.01" y2="11"></line><line x1="18" y1="11" x2="18.01" y2="11"></line><line x1="6" y1="14" x2="6.01" y2="14"></line><line x1="10" y1="14" x2="10.01" y2="14"></line><line x1="14" y1="14" x2="14.01" y2="14"></line><line x1="18" y1="14" x2="18.01" y2="14"></line></svg>`;
}
function wifiIconSVG(c: string) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.55a11 11 0 0 1 14.08 0"></path><path d="M1.42 9a16 16 0 0 1 21.16 0"></path><path d="M8.53 16.11a6 6 0 0 1 6.95 0"></path><line x1="12" y1="20" x2="12.01" y2="20"></line></svg>`;
}
function serverIconSVG(c: string) {
  return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect><rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect><line x1="6" y1="6" x2="6.01" y2="6"></line><line x1="6" y1="18" x2="6.01" y2="18"></line></svg>`;
}
function locationIconSVG(c = "#94a3b8") {
  return `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="3"></circle><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"></path></svg>`;
}

const NAV_ITEMS = [
  { label: "Topología", key: "Topologia", iconFn: topologyIconSVG },
  { label: "Switches", key: "Switches", iconFn: switchIconSVG },
  { label: "Access Points", key: "Access Points en Gigas", iconFn: wifiIconSVG },
  { label: "Appliance Status", key: "Appliance Status", iconFn: serverIconSVG },
];

/**
 * Construye un contenedor temporal en el DOM con el layout idéntico a
 * SidebarTopBar.details.jsx (TopBar 64px + Sidebar 280px + Content).
 * Se posiciona visible para que html-to-image pueda renderizarlo.
 * Se elimina inmediatamente después de la captura.
 */
function buildCaptureLayout(
  contentEl: HTMLElement,
  sectionName: string,
  predioCode: string,
  networkId: string,
): HTMLElement {
  const now = new Date();
  const dateStr = now.toLocaleString("es-MX", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
  });

  // GPS del sidebar real
  const sidebarText = document.querySelector("aside")?.textContent || "";
  const gpsMatch = sidebarText.match(/([\-]?\d+\.\d+),\s*([\-]?\d+\.\d+)/);
  const gpsText = gpsMatch ? `${gpsMatch[1]}, ${gpsMatch[2]}` : "";

  // Nav — estilos idénticos a .sidebar-menu-item de SidebarTopBar.details.jsx
  const navHTML = NAV_ITEMS.map((item) => {
    const active = item.key === sectionName;
    const iconColor = active ? "#2563eb" : "#475569";
    const icon = item.iconFn(iconColor);
    return `<div style="display:flex;align-items:center;gap:12px;padding:12px 16px;color:${active ? "#2563eb" : "#475569"};border-left:3px solid ${active ? "#2563eb" : "transparent"};font-size:13px;font-weight:500;${active ? "background:#eff6ff;" : ""}">
      <span style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;flex-shrink:0;">${icon}</span>
      <span>${item.label}</span></div>`;
  }).join("");

  // GPS block — estilos idénticos a .sidebar-gps / .sidebar-section-label
  const gpsBlock = gpsText
    ? `<div style="margin-top:12px;padding-top:12px;border-top:1px solid #e2e8f0;">
        <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;display:flex;align-items:center;justify-content:center;gap:4px;">
          ${locationIconSVG("#94a3b8")} Ubicación GPS
        </div>
        <div style="font-size:11px;font-weight:600;color:#475569;font-family:'Courier New',monospace;letter-spacing:0.3px;text-align:center;">${gpsText}</div>
      </div>`
    : "";

  // Shell — posicionado VISIBLE para que html-to-image lo capture correctamente
  const shell = document.createElement("div");
  shell.style.cssText =
    "position:fixed;top:0;left:0;z-index:99999;width:1500px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#fff;";

  shell.innerHTML = `
    <!-- TopBar — idéntico a .topbar de SidebarTopBar.details.jsx -->
    <div style="height:64px;background:linear-gradient(135deg,#1e3a8a 0%,#2563eb 100%);color:#fff;display:flex;align-items:center;padding:0 20px;gap:16px;box-shadow:0 2px 8px rgba(15,23,42,0.12);border-bottom:1px solid rgba(255,255,255,0.1);">
      <div style="display:flex;align-items:center;gap:12px;min-width:fit-content;">
        <div style="width:40px;height:40px;border-radius:8px;background:rgba(255,255,255,0.2);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:18px;color:#fff;">M</div>
        <div style="font-size:18px;font-weight:700;color:#fff;">Portal</div>
      </div>
      <div style="flex:1;min-width:300px;">
        <div style="display:flex;align-items:center;background:rgba(255,255,255,0.15);border-radius:8px;padding:0 12px;border:1px solid rgba(255,255,255,0.2);">
          <div style="flex:1;padding:12px 8px;font-size:14px;color:rgba(255,255,255,0.6);">Buscar por predio, serial (XXXX-XXXX-XXXX) o MAC...</div>
          <div style="padding:6px;display:flex;align-items:center;opacity:0.8;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
          </div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px;">
        <div style="display:flex;align-items:center;justify-content:center;background:#fff;border-radius:6px;padding:4px 10px;height:34px;">
          <svg width="24" height="24" viewBox="0 0 40 40" fill="none"><rect width="40" height="40" rx="6" fill="#fff"/><text x="20" y="27" font-size="24" font-weight="700" fill="#2563eb" text-anchor="middle" font-family="Arial">D</text></svg>
        </div>
        <div style="display:flex;align-items:center;gap:6px;color:#fff;font-size:13px;padding:8px 12px;border-radius:6px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Salir</span>
        </div>
      </div>
    </div>
    <!-- Body: Sidebar + Content -->
    <div style="display:flex;min-height:600px;">
      <!-- Sidebar — idéntico a .sidebar de SidebarTopBar.details.jsx (280px) -->
      <div style="width:280px;background:#ffffff;border-right:1px solid #e2e8f0;display:flex;flex-direction:column;flex-shrink:0;">
        <div style="padding:16px;display:flex;align-items:center;justify-content:space-between;gap:8px;border-bottom:1px solid #e2e8f0;min-height:80px;">
          <div style="flex:1;margin-right:8px;">
            <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Predio</div>
            <div style="font-size:15px;font-weight:700;color:#1e293b;">${predioCode}</div>
            ${networkId ? `<div style="font-size:12px;color:#64748b;margin-top:4px;">${networkId}</div>` : ""}
          </div>
          <div style="padding:6px;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#475569" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
          </div>
        </div>
        <div style="flex:1;overflow-y:auto;padding:12px 0;">${navHTML}</div>
        <div style="padding:16px;border-top:1px solid #e2e8f0;background:#f8fafc;margin-top:auto;">
          <div style="font-size:10px;font-weight:700;color:#94a3b8;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:6px;">Fecha y Hora</div>
          <div style="font-size:13px;font-weight:600;color:#475569;font-family:'Courier New',monospace;letter-spacing:0.3px;text-align:center;">${dateStr}</div>
          ${gpsBlock}
        </div>
      </div>
      <div style="flex:1;padding:24px 28px;overflow:hidden;" data-capture-content></div>
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
