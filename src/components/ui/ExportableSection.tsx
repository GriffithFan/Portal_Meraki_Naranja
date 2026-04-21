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
  { label: "Puntos de acceso", key: "Access Points en Gigas", iconFn: wifiIconSVG },
  { label: "Estado (appliances)", key: "Appliance Status", iconFn: serverIconSVG },
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

  // Nav — pill-style matching Meraki original
  const navHTML = NAV_ITEMS.map((item) => {
    const active = item.key === sectionName;
    const iconColor = active ? "#fff" : "#475569";
    const icon = item.iconFn(iconColor);
    const activeStyle = active
      ? "background:#2563eb;border-radius:8px;color:#fff;font-weight:600;"
      : "color:#475569;font-weight:500;";
    return `<div style="display:flex;align-items:center;gap:12px;padding:10px 14px;margin:2px 8px;font-size:13px;${activeStyle}">
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
    "position:fixed;top:0;left:0;z-index:99999;width:1500px;font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;background:#F1F5F9;";

  shell.innerHTML = `
    <!-- TopBar — compacto, matching captura original -->
    <div style="height:48px;background:#153452;color:#fff;display:flex;align-items:center;padding:0 16px;gap:12px;">
      <div style="display:flex;align-items:center;gap:8px;min-width:fit-content;">
        <div style="width:28px;height:28px;border-radius:6px;background:#4085CE;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:13px;color:#fff;">M</div>
        <div style="font-size:14px;font-weight:700;color:#fff;">Portal</div>
      </div>
      <div style="flex:0 1 360px;">
        <div style="display:flex;align-items:center;background:#344D67;border-radius:50px;padding:0 4px 0 14px;border:1px solid rgba(255,255,255,0.25);">
          <div style="flex:1;padding:6px 0;font-size:13px;color:rgba(255,255,255,0.7);">${predioCode}</div>
          <div style="width:30px;height:30px;border-radius:50%;background:#2B6CEE;display:flex;align-items:center;justify-content:center;margin:2px 0;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><path d="m21 21-4.35-4.35"></path></svg>
          </div>
        </div>
      </div>
      <div style="flex:1;"></div>
      <div style="display:flex;align-items:center;gap:10px;">
        <div style="display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px;padding:4px 14px;height:30px;border:1px solid rgba(255,255,255,0.3);">
          <svg xmlns="http://www.w3.org/2000/svg" height="20" viewBox="0 0 1733 402"><path fill="#ffc803" d="M324.95 61.82a393 393 0 0 1 44.86-5.27q-.02 125.54.01 251.08c39.77-26.52 74.44-62.08 95.61-105.27 10.46-21.79 17.43-45.95 15.78-70.32-1.11-17.95-7.94-35.73-20.23-49.01-10.31-11.43-23.97-19.27-38.24-24.7 24.81 3.42 49.9 10.63 70.18 25.85 13.7 10.24 24.38 24.98 28.07 41.84 4.75 20.57-.19 42.14-9.16 60.85-11.91 24.6-30.06 45.61-50.03 64.03-26.79 24.33-57.4 44.22-89.7 60.43-46.73 23.3-97.29 39.21-149.18 45.51-9.94.75-19.87 2.36-29.86 2.01-19.4-6.77-36.08-20.59-46.91-38.02-21.76-32.8-29.18-74.13-22.63-112.73 2.49-13.75 7.25-27.15 14.47-39.13 2.34-4.27 5.52-7.98 8.07-12.1-22.02 24.73-40.34 53.52-49.31 85.62-6.62 23.93-7.23 50.82 4.51 73.3 10.26 20.08 29.78 33.95 50.76 41.11-12.94-.48-25.58-4.04-37.83-8.06A170 170 0 0 1 89 338.01c-17.16-9.76-31.91-25.21-37.46-44.51-5.72-18.88-2.67-39.35 4.61-57.36 9.71-23.96 26.02-44.59 44.03-62.88 37.84-37.2 84.26-64.78 133.19-84.76a62 62 0 0 1 9.94-3.6c-31.32 14.92-60.29 34.83-85.1 59.11 23.13-19.59 54.1-26.95 83.84-27.16 21.33-.28 41.97 7.9 59.34 19.87 7.51 5.17 14.54 11.11 20.45 18.08-.08-30.31-.02-60.63-.04-90.94-.56-2 2.05-1.59 3.15-2.04m-95.37 91.93c-15.4 2.17-30.61 8.9-40.87 20.88-12.08 13.87-16.99 32.4-18.71 50.34-1.64 19.17-1.02 39.04 5.75 57.25 5.97 15.48 16.09 30.08 30.83 38.3 14.82 8.44 32.57 10.79 49.34 8.77 21.43-2.81 40.03-16.76 51.99-34.31 8.92-13.19 15.51-28.76 14.95-44.94-.39-18.75-2.42-37.84-9.59-55.32-5.6-13.82-15.33-26.31-28.6-33.44-16.72-9.05-36.59-10.08-55.09-7.53"/><path fill="#6b696b" d="M676.68 134.45q13.86-.04 27.71 0 .01 67.73-.01 135.46h-25.23q-.02-6.67.02-13.33c-11.25 11.42-27.77 14.85-43.13 16.28-17.42.2-35.93-1.34-51.01-10.9-13.54-9.1-23.11-24.5-23.94-40.94-.77-10.62 2.3-21.59 9.14-29.84 9.05-11.22 22.77-17.72 36.75-20.26a121 121 0 0 1 39.14-.58c11.55 1.62 22.04 7.69 30.59 15.42-.07-17.1-.01-34.2-.03-51.31m-55.18 50.28c-8.36 1.03-16.87 3.81-23.11 9.69-5.4 5.04-8.35 12.22-9.23 19.46-1.43 10.38.2 21.73 6.84 30.13 5.09 6.7 12.81 11 20.93 12.85 14.7 3.27 30.57 1.85 44.14-4.83 5.85-2.75 11.11-7.23 13.69-13.27 3.5-8.09 2.86-17.26 1.29-25.73-1.82-9.99-7.97-19.35-17.22-23.88-11.48-5.68-24.85-5.98-37.33-4.42m920.3-50.21c8.92-.19 17.85-.03 26.78-.08l.01 50.55c7.01-4.96 14.14-10.03 22.2-13.16 9.45-2.8 19.46-2.76 29.24-2.75 12.47.36 25.08 2.24 36.6 7.24 5.69 2.48 10.9 6.52 13.84 12.09 2.58 4.74 3.43 10.22 3.41 15.57l-.01 65.93h-27.18c-.02-21.34.01-42.67-.01-64.01.11-6.61-2.48-13.7-8.26-17.36-5.83-3.44-12.77-4.14-19.39-4.51-12.05-.55-24.51 1.04-35.31 6.68-9.93 4.61-15.74 15.49-15.14 26.28l.01 52.91q-13.38.03-26.73.01c-.05-45.13.07-90.26-.06-135.39M742 135h28v19h-28zm385.04 15.22 28.18.01.01 23.91c14.83.02 29.67-.01 44.51.02v12.83c-14.84.03-29.68-.01-44.51.02.07 19.32-.12 38.64.09 57.95.23 6.08 5.7 10.3 11.19 11.69 12.51 3.42 25.6 1.35 38.3.25l-.16 14.63c-15.53 1.47-31.21 2.18-46.75.57-8.46-.98-17.22-2.72-24.36-7.61-5.8-4.1-6.03-12.02-6.46-18.43-.13-19.69-.01-39.37-.06-59.06-8.89-.01-17.78.02-26.67-.01v-12.83c8.89-.03 17.78 0 26.67-.02.02-7.97-.01-15.94.02-23.92m147.53 18.46c17.41-2.53 35.88-.9 51.78 7.01 8.05 4.09 15.48 9.99 19.99 17.94 5.92 9.82 8.16 21.41 8.25 32.76-36.35.03-72.69-.02-109.03.03.19 6.96 1.69 14.26 6.29 19.72 5.85 7.13 15.11 10.18 23.94 11.49 13.03 1.74 27.05 1.43 38.9-4.9 5.43-3.09 11.14-7.15 12.79-13.55 8.5.05 17.01-.09 25.53.08-3.82 9.55-10.68 17.96-19.64 23.12-14.11 8.74-31.2 10.28-47.42 10.5-18.01.07-37.16-3.51-51.2-15.55-7.83-6.67-13.67-15.91-15.29-26.16-2.33-15.17 1.74-31.84 12.87-42.82 11.3-11.14 26.73-17.29 42.24-19.67M1262 189.85c-8.46 4.79-16.26 12.9-16.48 23.19q41.48.02 82.96 0c-.69-7.04-3.39-13.96-8.42-19.03-6.16-6.67-15.38-9.26-24.14-10.14-11.54-1.4-23.77.01-33.92 5.98m-431.48-4.03c11.4-10.57 26.93-16.14 42.39-16.5 14.45-.34 29.73.85 42.52 8.22 8.73 4.93 14.75 14.39 14.77 24.51.11 22.68.02 45.37.04 68.05h-25.43c-.02-20.35.01-40.7-.01-61.05.02-7.29-2.19-15.1-7.93-19.95-5.61-4.35-13.02-5.12-19.87-5.48-11.7-.28-24.06 1.62-33.78 8.58-4.69 3.45-8.67 8.16-10.35 13.81-1.37 4.19-1.16 8.67-1.15 13.02v51.07q-12.5.02-24.98 0-.02-49.2 0-98.4l23.81-.01c.03 4.71.06 9.42-.03 14.13m571.5-5.7c18.84-10.11 40.93-12.36 61.97-10.92 11.55 1.13 23.18 3.85 33.44 9.4 9.54 5.21 15.62 15.23 17.31 25.81q-12.96.03-25.9.01c-1.78-6.45-5.92-12.24-11.85-15.45-11.27-6.1-24.67-6.21-37.05-4.48-9.44 1.23-19.09 4.53-25.8 11.55-5.62 5.82-8.36 13.89-8.79 21.86-.58 9.1.94 18.84 6.6 26.25 5.67 7.36 14.65 11.37 23.56 13.18 12.94 2.19 26.8.93 38.53-5.24 6.77-3.49 12.38-9.5 14.22-17.02q13.24-.02 26.48 0a39.6 39.6 0 0 1-16.18 24.46c-12.77 9.24-28.89 11.86-44.26 12.86-12.94.92-25.98-.79-38.41-4.37-10.11-3.33-20.81-6.75-28.42-14.59-9.7-10.02-12.76-25.12-10.2-38.54 1.06-15.09 11.77-27.86 24.75-34.77M742 172h28v98h-28zm235.45 9.46c13.58-7.37 29.4-8.86 44.59-9.2 14.34.02 29.35.67 42.39 7.31a23.4 23.4 0 0 1 12.77 20.5c.95 18.68-.49 37.43 1.21 56.09.4 5.71 3.18 10.9 6.45 15.49-8.1-.07-16.2.01-24.3-.05a34 34 0 0 1-4.87-12.26c-11.75 7.2-24.9 12.32-38.7 13.58-14.42 1.36-29.61 1.02-43.07-4.87-8.43-3.7-16.21-11.29-16.54-20.99-.7-9.14 5.56-17.18 13.05-21.67 9.79-5.8 21.24-7.96 32.43-9.02 17.15-1.71 34.43-2.8 51.31-6.52.54-6.41-.18-14.14-6.12-17.95-8.96-5.41-19.88-5.85-30.07-5.78-8.05.38-16.65.79-23.69 5.15-4.73 3.04-7.7 8.02-9.85 13.09-7.74-.68-15.48-1.28-23.21-1.99 2.71-8.59 8.12-16.62 16.22-20.91m31.65 48.18c-6.84 1.13-14.17 1.49-20.15 5.36-3.73 2.31-6.64 6.41-6.37 10.94.22 4.74 3.75 8.54 7.71 10.75 7.74 4.07 16.82 4.31 25.38 3.89 12.02-.86 25-4.18 33.27-13.56 5.76-6.67 5.11-16.06 5.32-24.29-14.78 3.8-30.02 5.26-45.16 6.91"/></svg>
        </div>
        <div style="display:flex;align-items:center;gap:5px;color:#fff;font-size:12px;padding:6px 12px;border-radius:8px;background:#344D67;border:1px solid rgba(255,255,255,0.25);">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
          <span>Salir</span>
        </div>
      </div>
    </div>
    <!-- Body: Sidebar + Content -->
    <div style="display:flex;min-height:600px;padding:16px;gap:16px;align-items:flex-start;">
      <!-- Sidebar — idéntico a .sidebar de SidebarTopBar.details.jsx (280px) -->
      <div style="width:260px;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);display:flex;flex-direction:column;flex-shrink:0;">
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
      <div style="flex:1;padding:24px 28px;overflow:hidden;background:#ffffff;border-radius:12px;box-shadow:0 1px 3px rgba(0,0,0,0.08);" data-capture-content></div>
    </div>
  `;

  // Clonar contenido y limpiar botones de export
  const clone = contentEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("[data-export-buttons]").forEach((el) => el.remove());

  // Force desktop layout in clone: remove mobile-only elements, show desktop-only
  clone.querySelectorAll("[class]").forEach((el) => {
    const cls = el.className;
    if (typeof cls !== "string") return;
    // Remove mobile-only containers (md:hidden, lg:hidden, sm:hidden)
    if (/\b(md|lg|sm|xl):hidden\b/.test(cls)) {
      el.remove();
      return;
    }
    // Show desktop-only containers (hidden md:block, hidden lg:block, etc.)
    if (/\bhidden\b/.test(cls) && /\b(md|lg|sm|xl):(block|table|flex|grid|inline)\b/.test(cls)) {
      (el as HTMLElement).style.display = "";
      el.classList.remove("hidden");
    }
    // Force Tailwind responsive grid columns (md: breakpoint) since CSS
    // media queries check viewport, not element width — on mobile viewport
    // the min-width breakpoints don't fire even though the shell is 1500px.
    const gridBracket = cls.match(/md:grid-cols-\[([^\]]+)\]/);
    if (gridBracket) {
      (el as HTMLElement).style.gridTemplateColumns = gridBracket[1].replace(/_/g, " ");
    }
    const gridN = cls.match(/md:grid-cols-(\d+)/);
    if (gridN) {
      (el as HTMLElement).style.gridTemplateColumns = `repeat(${gridN[1]}, minmax(0, 1fr))`;
    }
  });

  // Override section title for capture (match Meraki original naming)
  const CAPTURE_TITLES: Record<string, string> = { "Access Points en Gigas": "Wireless" };
  const h1 = clone.querySelector("h1");
  if (h1) {
    const capTitle = CAPTURE_TITLES[sectionName];
    if (capTitle) h1.textContent = capTitle;
    // Remove subtitle in capture
    const nextP = h1.nextElementSibling;
    if (nextP?.tagName === "P") nextP.remove();
  }

  const contentArea = shell.querySelector("[data-capture-content]");
  if (contentArea) contentArea.appendChild(clone);

  // Inject document stylesheets into the shell so html-to-image can resolve
  // CSS-defined styles (e.g. .NodePort polygon { fill }, backgrounds, etc.)
  // Strip responsive media queries so mobile captures render as desktop.
  const styleTag = document.createElement("style");
  const cssRules: string[] = [];
  const darkFallbackRules: string[] = []; // dark rules stripped of .dark prefix as low-priority fallbacks

  const stripDarkPrefix = (sel: string) => sel.replace(/\.dark\s+/g, "").replace(/\.dark(?=[\s.>:,[\]$])/g, "").trim();

  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        // Collect dark-mode CSS rules as fallbacks (strip .dark prefix)
        if (rule instanceof CSSStyleRule && /\.dark[\s.>:,[\]]/.test(rule.selectorText)) {
          const stripped = stripDarkPrefix(rule.selectorText);
          if (stripped) darkFallbackRules.push(`${stripped} { ${rule.style.cssText} }`);
          continue;
        }
        if (rule instanceof CSSMediaRule) {
          // Skip mobile-first overrides (max-width)
          if (/max-width/i.test(rule.conditionText)) continue;
          // Skip prefers-color-scheme: dark
          if (/prefers-color-scheme:\s*dark/i.test(rule.conditionText)) continue;
          // Include desktop breakpoint rules (min-width) as regular rules
          // so Tailwind responsive classes apply regardless of viewport
          if (/min-width/i.test(rule.conditionText)) {
            for (const inner of Array.from(rule.cssRules)) {
              if (inner instanceof CSSStyleRule && /\.dark[\s.>:,[\]]/.test(inner.selectorText)) {
                const stripped = stripDarkPrefix(inner.selectorText);
                if (stripped) darkFallbackRules.push(`${stripped} { ${inner.style.cssText} }`);
                continue;
              }
              cssRules.push(inner.cssText);
            }
            continue;
          }
        }
        cssRules.push(rule.cssText);
      }
    } catch {
      // Cross-origin stylesheets throw SecurityError — skip them
    }
  }
  // Dark fallback rules go FIRST so regular (light) rules override them
  // when both selectors match. Elements with ONLY dark: Tailwind classes
  // get the dark-mode color as fallback (visible, better than inheriting black).
  styleTag.textContent = darkFallbackRules.join("\n") + "\n" + cssRules.join("\n");
  // Force uppercase table headers in capture (match Meraki original)
  styleTag.textContent += "\n[data-capture-content] th { text-transform: uppercase !important; font-size: 11px !important; font-weight: 600 !important; color: #64748b !important; letter-spacing: 0.5px !important; }";
  // Force light-mode modern-table styles regardless of which CSS files are loaded on the current page.
  // AppliancePorts.css (which defines the light .modern-table rules) is only imported in ApplianceSection,
  // so Switches and APs pages may not have it — without these overrides the stripped dark-fallback rules win.
  styleTag.textContent += "\n[data-capture-content] .modern-table th { background: #f1f5f9 !important; color: #475569 !important; border-bottom: 2px solid #cbd5e1 !important; }";
  styleTag.textContent += "\n[data-capture-content] .modern-table td { color: #1e293b !important; border-bottom-color: #f1f5f9 !important; }";
  styleTag.textContent += "\n[data-capture-content] .modern-table tr:hover td { background: #f8fafc !important; }";
  // Force light background for summary chips container
  styleTag.textContent += "\n[data-capture-content] .summary-chips-container { background: #f1f5f9 !important; border: none !important; }";
  styleTag.textContent += "\n[data-capture-content] .summary-chip { background: #f1f5f9 !important; border-color: #cbd5e1 !important; }";
  // Force desktop table display
  styleTag.textContent += "\n[data-capture-content] table { display: table !important; }";
  styleTag.textContent += "\n[data-capture-content] thead { display: table-header-group !important; }";
  styleTag.textContent += "\n[data-capture-content] tbody { display: table-row-group !important; }";
  styleTag.textContent += "\n[data-capture-content] tr { display: table-row !important; }";
  styleTag.textContent += "\n[data-capture-content] th, [data-capture-content] td { display: table-cell !important; }";
  shell.prepend(styleTag);

  document.body.appendChild(shell);
  return shell;
}

/* ─── Force light-mode inline styles for capture ─── */

/** Parse rgb/rgba string to [r, g, b] */
function parseRGB(rgb: string): [number, number, number] | null {
  const m = rgb.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (!m) return null;
  return [parseInt(m[1]), parseInt(m[2]), parseInt(m[3])];
}

/** Perceived luminance 0..1 (ITU-R BT.601) */
function luminance(r: number, g: number, b: number): number {
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/** Check if color is "achromatic" (gray/white/black — low saturation) */
function isGrayish(r: number, g: number, b: number): boolean {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return (mx - mn) < 30; // low chroma spread
}

/**
 * Walk the capture shell and replace dark inline styles with light equivalents.
 * Targets elements with a style attribute. Uses computed-style luminance
 * checks so it works regardless of hex/rgb format.
 *
 * Strategy:
 * - Dark backgrounds (luminance < 0.18) → white
 * - Near-white achromatic text (lum > 0.80, grayish) → dark text
 *   This catches white/light-gray text used for dark-mode readability
 *   but preserves colored text (light green status, light blue links, etc.)
 * - Dark borders → light gray
 */
function forceLightInlineStyles(root: HTMLElement) {
  root.querySelectorAll("[style]").forEach((node) => {
    const el = node as HTMLElement;
    const cs = window.getComputedStyle(el);
    // Fix dark backgrounds → white
    const bg = cs.backgroundColor;
    if (bg && bg !== "rgba(0, 0, 0, 0)" && bg !== "transparent") {
      const rgb = parseRGB(bg);
      if (rgb) {
        const lum = luminance(...rgb);
        if (lum < 0.18) el.style.backgroundColor = "#ffffff";
      }
    }
    // Fix near-white GRAYISH text → dark text (preserve colored text)
    const color = cs.color;
    if (color) {
      const rgb = parseRGB(color);
      if (rgb) {
        const lum = luminance(...rgb);
        if (lum > 0.80 && isGrayish(...rgb)) {
          el.style.color = "#374151";
        }
      }
    }
    // Fix dark border colors
    const bc = cs.borderTopColor;
    if (bc && bc !== "rgba(0, 0, 0, 0)" && bc !== "transparent") {
      const rgb = parseRGB(bc);
      if (rgb) {
        const lum = luminance(...rgb);
        if (lum < 0.18) el.style.borderColor = "#e5e7eb";
      }
    }
  });

  // Fix SVG text fills: topology graph uses useTheme() to set fill colors as SVG attributes.
  // When capturing in dark mode, the theme context still returns "dark" even after removing .dark
  // from <html>, so text elements have near-white fill (#f1f5f9, #cbd5e1) → invisible on white bg.
  root.querySelectorAll("svg text, svg tspan").forEach((svgNode) => {
    const el = svgNode as SVGElement;
    const cs = window.getComputedStyle(el);
    const fillVal = cs.getPropertyValue("fill");
    if (!fillVal || fillVal === "none") return;
    const rgb = parseRGB(fillVal);
    if (!rgb) return;
    const lum = luminance(...rgb);
    // Near-white grayish fill → dark text color
    if (lum > 0.65 && isGrayish(...rgb)) {
      (el as unknown as HTMLElement).style.fill = lum > 0.85 ? "#1e293b" : "#475569";
    }
  });

  // Fix SVG shape dark fills: external/internet node uses fill="#1e293b" in dark mode
  // which renders as a solid black diamond on the white capture background.
  root.querySelectorAll("svg rect[fill], svg circle[fill], svg polygon[fill]").forEach((svgNode) => {
    const el = svgNode as SVGElement;
    const cs = window.getComputedStyle(el);
    const fillVal = cs.getPropertyValue("fill");
    if (!fillVal || fillVal === "none") return;
    const rgb = parseRGB(fillVal);
    if (!rgb) return;
    const lum = luminance(...rgb);
    // Near-black grayish fill → white (only shapes, not status-colored dots)
    if (lum < 0.18 && isGrayish(...rgb)) {
      (el as unknown as HTMLElement).style.fill = "#ffffff";
    }
  });
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

    // Force light mode for capture — temporarily remove dark class from <html>
    // so CSS .dark selectors don't match, then fix inline React dark styles.
    const htmlEl = document.documentElement;
    const wasDark = htmlEl.classList.contains("dark");
    if (wasDark) htmlEl.classList.remove("dark");
    // Only fix inline dark styles in the CONTENT area (not the shell chrome).
    // The TopBar/Sidebar are hardcoded light-appropriate HTML; touching them
    // in light mode would convert white text to dark on a dark background.
    const captureContentEl = shell.querySelector("[data-capture-content]") as HTMLElement | null;
    if (wasDark && captureContentEl) forceLightInlineStyles(captureContentEl);

    try {
      const raw = await toCanvas(shell, {
        pixelRatio: 2,
        backgroundColor: "#F1F5F9",
        cacheBust: true,
      });

      if (!raw || raw.width === 0 || raw.height === 0) {
        throw new Error(`Canvas vacío (${raw?.width}x${raw?.height})`);
      }

      return raw;
    } finally {
      if (wasDark) htmlEl.classList.add("dark");
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
