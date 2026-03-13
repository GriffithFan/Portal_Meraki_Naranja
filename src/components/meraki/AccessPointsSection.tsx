"use client";
import { useEffect, useMemo, useState } from "react";
import { LoadingSpinner } from "./DashboardStates";
import { SummaryChip } from "./DashboardHelpers";
import { normalizeReachability } from "@/utils/networkUtils";
import { SortableHeader } from "./SortableHeader";
import { useTableSort } from "@/hooks/useTableSort";
import Tooltip from "./Tooltip";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface AccessPointsSectionProps {
  summaryData: any;
  loadedSections: Set<string>;
  sectionLoading: string | null;
  loadSection: (key: string) => Promise<void>;
}

function formatWiredSpeed(speedString: string | null | undefined, isMeshRepeater = false): string {
  if (isMeshRepeater) return "—";
  if (!speedString || speedString === "—" || speedString === "-") return "—";

  // Si ya tiene duplex info, devolver tal cual
  if (/(full|half)\s*duplex/i.test(speedString)) return speedString;

  const lower = speedString.toLowerCase();

  // Parsear duplex del string LLDP si está embebido: "1000BASE-T Full"
  let duplex = "";
  if (lower.includes("full")) duplex = ", Full Duplex";
  else if (lower.includes("half")) duplex = ", Half Duplex";

  // Convertir a formato legible
  if (/gbps|gb\/s|gbit/i.test(lower)) {
    const m = speedString.match(/(\d+(?:\.\d+)?)/);
    return m ? `${m[1]} Gbps${duplex}` : speedString;
  }
  if (/mbps|mb\/s|mbit/i.test(lower)) {
    const m = speedString.match(/(\d+(?:\.\d+)?)/);
    return m ? `${m[1]} Mbps${duplex}` : speedString;
  }

  // Número puro → asumir Mbps
  const numMatch = speedString.match(/(\d+)/);
  if (numMatch) {
    const num = parseInt(numMatch[1], 10);
    if (num >= 1000) return `${num / 1000} Gbps${duplex}`;
    return `${num} Mbps${duplex}`;
  }

  return speedString;
}

function APConnectivityBar({ ap }: { ap: any }) {
  const segments: { color: string; tooltip: string }[] = useMemo(() => {
    const statusN = normalizeReachability(ap.status);
    const isDormant = /dormant/i.test(ap.status || "");
    const isOnline = statusN === "connected";
    const numBuckets = 120;   // ~120 segmentos visuales
    const bucketSize = 720;   // 12 min cada uno (120 × 720s = 86400s = 24h)
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - numBuckets * bucketSize;

    // Color palette (replica Meraki Dashboard)
    const COLOR_ONLINE = "#22c55e";   // verde — online/alerting (operativo)
    const COLOR_OFFLINE = "#ef4444";  // rojo — offline
    const COLOR_DORMANT = "#cbd5e1";  // gris — dormant/sin datos
    const fmt = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

    // Helper: extraer status de un evento Meraki
    // La API devuelve details.new como array: [{ name: "status", value: "online" }, ...]
    const extractStatus = (detailsNew: any): string | undefined => {
      if (Array.isArray(detailsNew)) {
        return detailsNew.find((d: any) => d.name === "status")?.value;
      }
      return detailsNew?.status; // fallback por si cambia la API
    };

    // Prioridad 0: availability change history (datos reales de la API)
    const availHistory: any[] = ap.availabilityHistory || [];
    // Filtrar solo eventos con status válido
    const validEvents = availHistory.filter((e: any) => extractStatus(e.details?.new));
    if (validEvents.length > 0) {
      const events = validEvents
        .map((e: any) => ({
          ts: Math.floor(new Date(e.ts).getTime() / 1000),
          newStatus: extractStatus(e.details.new)!,
        }))
        .sort((a: any, b: any) => a.ts - b.ts);

      // Estado inicial: gris (sin datos) a menos que un evento ANTES de la ventana
      // confirme un estado conocido.
      let initialStatus = isDormant ? "dormant" : "unknown";
      for (const evt of events) {
        if (evt.ts <= windowStart) initialStatus = evt.newStatus;
      }

      return Array.from({ length: numBuckets }, (_, i) => {
        const bucketStart = windowStart + i * bucketSize;
        const bucketEnd = bucketStart + bucketSize;
        const startDate = new Date(bucketStart * 1000);
        const endDate = new Date(bucketEnd * 1000);

        // Estado dominante al inicio del bucket
        let bucketStatus = initialStatus;
        for (const evt of events) {
          if (evt.ts <= bucketStart) bucketStatus = evt.newStatus;
        }

        // Si hubo transiciones dentro del bucket, tomar el peor estado
        let hadOffline = false;
        let hadOnline = false;
        for (const evt of events) {
          if (evt.ts > bucketStart && evt.ts < bucketEnd) {
            if (/offline/i.test(evt.newStatus)) hadOffline = true;
            if (/online|alerting/i.test(evt.newStatus)) hadOnline = true;
          }
        }

        let color: string;
        let label: string;
        if (/unknown/i.test(bucketStatus) && !hadOnline && !hadOffline) {
          color = COLOR_DORMANT; label = "Sin datos";
        } else if (/dormant/i.test(bucketStatus) && !hadOnline && !hadOffline) {
          color = COLOR_DORMANT; label = "Dormant";
        } else if (hadOffline && hadOnline) {
          color = COLOR_OFFLINE; label = "Transición (caída detectada)";
        } else if (hadOffline || /offline/i.test(bucketStatus)) {
          color = COLOR_OFFLINE; label = "Sin conectividad";
        } else if (/unknown/i.test(bucketStatus) && (hadOnline || hadOffline)) {
          color = hadOffline ? COLOR_OFFLINE : COLOR_ONLINE;
          label = hadOffline ? "Sin conectividad" : "Conectado";
        } else {
          color = COLOR_ONLINE; label = /alerting/i.test(bucketStatus) ? "Alerting" : "Conectado";
        }
        return { color, tooltip: `${label}\n${fmt(startDate)} - ${fmt(endDate)}` };
      });
    }

    // Prioridad 1: wireless.history (señal real del AP)
    const wireless = ap.wireless || {};
    const historyArray = Array.isArray(wireless.history) ? wireless.history : [];

    if (historyArray.length > 0) {
      return historyArray.map((sample: { ts: number; signalQuality: number }) => {
        const quality = sample.signalQuality ?? 0;
        const isDown = quality <= 25;
        return {
          color: isDown ? COLOR_OFFLINE : COLOR_ONLINE,
          tooltip: `Señal: ${quality}%\n${new Date(sample.ts * 1000).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" })}`,
        };
      });
    }

    // Prioridad 2: failureEvents (fallos de conexión del backend)
    const failureEvents: { ts: string; type: string; step: string }[] = ap.failureEvents || [];

    const failBuckets = new Map<number, { count: number; types: string[] }>();
    for (const evt of failureEvents) {
      const t = Math.floor(new Date(evt.ts).getTime() / 1000);
      const idx = Math.floor((t - (now - numBuckets * bucketSize)) / bucketSize);
      if (idx >= 0 && idx < numBuckets) {
        const existing = failBuckets.get(idx) || { count: 0, types: [] };
        existing.count++;
        if (evt.type && !existing.types.includes(evt.type)) existing.types.push(evt.type);
        failBuckets.set(idx, existing);
      }
    }

    // Si el AP está dormant, toda la barra es gris
    if (isDormant) {
      return Array.from({ length: numBuckets }, (_, i) => {
        const bucketStart = now - (numBuckets - i) * bucketSize;
        const bucketEnd = bucketStart + bucketSize;
        return { color: COLOR_DORMANT, tooltip: `Dormant\n${fmt(new Date(bucketStart * 1000))} - ${fmt(new Date(bucketEnd * 1000))}` };
      });
    }

    // Fallback sin eventos de disponibilidad: usar lastReportedAt para inferir
    // cuándo el dispositivo reportó por última vez. Antes de eso → gris.
    // Meraki muestra gris para la mayoría de la barra cuando no hay eventos.
    const lastReported = ap.lastReportedAt ? Math.floor(new Date(ap.lastReportedAt).getTime() / 1000) : 0;
    // Rango "activo": desde max(windowStart, lastReported - 86400) hasta lastReported (o now si online)
    const activeEnd = isOnline ? now : (lastReported || now);
    // Estimamos actividad desde el inicio más reciente entre el windowStart y 1h antes del último reporte
    // Para APs offline, esto limita la zona verde al período cercano al último reporte
    const activeStart = lastReported ? Math.max(windowStart, lastReported - 3600) : windowStart;

    return Array.from({ length: numBuckets }, (_, i) => {
      const bucketStart = windowStart + i * bucketSize;
      const bucketEnd = bucketStart + bucketSize;
      const startD = new Date(bucketStart * 1000);
      const endD = new Date(bucketEnd * 1000);
      const fail = failBuckets.get(i);
      let color: string;
      let label: string;

      // Antes de la zona activa → gris
      if (bucketEnd <= activeStart) {
        color = COLOR_DORMANT;
        label = "Sin datos";
      } else if (!isOnline && lastReported && bucketStart >= lastReported) {
        // Después del último reporte para APs offline → rojo
        color = COLOR_OFFLINE;
        label = "Sin conectividad";
      } else if (fail) {
        color = COLOR_OFFLINE;
        label = `${fail.count} fallo(s): ${fail.types.join(", ") || "conexión"}`;
      } else if (bucketStart >= activeStart && bucketEnd <= activeEnd) {
        color = COLOR_ONLINE;
        label = "Conectado";
      } else {
        color = COLOR_DORMANT;
        label = "Sin datos";
      }
      return { color, tooltip: `${label}\n${fmt(startD)} - ${fmt(endD)}` };
    });
  }, [ap]);

  return (
    <div style={{ display: "flex", height: "8px", overflow: "hidden", background: "#d1d5db" }}>
      {segments.map((seg, i) => (
        <div key={i} style={{ flex: 1, background: seg.color, cursor: "help" }} title={seg.tooltip} />
      ))}
    </div>
  );
}

function APTooltipContent({ ap }: { ap: any }) {
  const ti = ap.tooltipInfo || {};
  return (
    <div>
      <div className="tooltip-title">{ti.name || ap.name || ap.serial}</div>
      {(ti.model || ap.model) && <div className="tooltip-row"><span className="tooltip-label">Modelo</span><span className="tooltip-value">{ti.model || ap.model}</span></div>}
      {(ti.serial || ap.serial) && <div className="tooltip-row"><span className="tooltip-label">Serial</span><span className="tooltip-value">{ti.serial || ap.serial}</span></div>}
      {ti.firmware && <div className="tooltip-row"><span className="tooltip-label">Firmware</span><span className="tooltip-value">{ti.firmware}</span></div>}
      {(ti.lanIp || ap.lanIp) && <div className="tooltip-row"><span className="tooltip-label">LAN IP</span><span className="tooltip-value">{ti.lanIp || ap.lanIp}</span></div>}
      {(ti.publicIp || ap.publicIp) && <div className="tooltip-row"><span className="tooltip-label">Public IP</span><span className="tooltip-value">{ti.publicIp || ap.publicIp}</span></div>}
      {ti.signalQuality != null && <div className="tooltip-row"><span className="tooltip-label">Calidad señal</span><span className="tooltip-value">{ti.signalQuality}%</span></div>}
      {ti.clients != null && <div className="tooltip-row"><span className="tooltip-label">Clientes</span><span className="tooltip-value">{ti.clients}</span></div>}
      {ti.microDrops > 0 && <div className="tooltip-row"><span className="tooltip-label">Microcortes</span><span className="tooltip-badge error">{ti.microDrops}</span></div>}
      {ap.isMeshRepeater && (
        <div className="tooltip-row" style={{ background: "#fef3c7", borderRadius: 4, padding: "2px 6px", marginBottom: 4 }}>
          <span className="tooltip-label" style={{ color: "#92400e" }}>Modo</span>
          <span className="tooltip-value" style={{ color: "#b45309", fontWeight: 600 }}>Mesh Repeater</span>
        </div>
      )}
      {ap.meshParentName && <div className="tooltip-row"><span className="tooltip-label">Conectado a</span><span className="tooltip-value">{ap.meshParentName} (Wireless)</span></div>}
      {(ti.connectedTo || ap.connectedTo) && (ti.connectedTo || ap.connectedTo) !== "-" && !ap.isMeshRepeater && (
        <div className="tooltip-row"><span className="tooltip-label">Conectado a</span><span className="tooltip-value">{ti.connectedTo || ap.connectedTo}</span></div>
      )}
      {(ti.wiredSpeed || ap.wiredSpeed) && (ti.wiredSpeed || ap.wiredSpeed) !== "—" && !ap.isMeshRepeater && (
        <div className="tooltip-row"><span className="tooltip-label">Velocidad Ethernet</span><span className="tooltip-value">{ti.wiredSpeed || ap.wiredSpeed}</span></div>
      )}
    </div>
  );
}

export default function AccessPointsSection({ summaryData, loadedSections, sectionLoading, loadSection }: AccessPointsSectionProps) {
  const { sortData, sortConfig, handleSort } = useTableSort();
  const [expandedAP, setExpandedAP] = useState<string | null>(null);

  useEffect(() => {
    if (!loadedSections.has("access_points")) loadSection("access_points");
  }, [loadedSections, loadSection]);

  if (sectionLoading === "access_points" || !loadedSections.has("access_points")) return <LoadingSpinner section="access_points" />;

  const accessPoints: any[] = summaryData?.accessPoints || [];

  if (accessPoints.length === 0) {
    return <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No hay puntos de acceso disponibles para esta red.</div>;
  }

  const online = accessPoints.filter((ap) => normalizeReachability(ap.status) === "connected").length;
  const offline = accessPoints.filter((ap) => normalizeReachability(ap.status) === "disconnected").length;
  const alerting = accessPoints.filter((ap) => normalizeReachability(ap.status) === "warning").length;
  const dormant = accessPoints.filter((ap) => /dormant/i.test(ap.status || "")).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, overflow: "visible" }}>
      <h2 style={{ margin: "0 0 12px 0", color: "#1e293b", fontSize: "20px", fontWeight: "600", borderBottom: "2px solid #cbd5e1", paddingBottom: "12px" }}>Access Points</h2>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "20px", padding: "14px", background: "#f1f5f9", borderRadius: "10px" }}>
        <SummaryChip label="Total APs" value={accessPoints.length} accent="#1f2937" />
        <SummaryChip label="Online" value={online} accent="#22c55e" />
        <SummaryChip label="Advertencia" value={alerting} accent="#f59e0b" />
        <SummaryChip label="Offline" value={offline} accent="#ef4444" />
        {dormant > 0 && <SummaryChip label="Dormant" value={dormant} accent="#94a3b8" />}
      </div>

      {sectionLoading === "access_points" && loadedSections.has("access_points") && (
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          padding: "8px 16px",
          background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 8,
          fontSize: 13, fontWeight: 600, color: "#1e40af",
          marginBottom: 12,
        }}>
          Actualizando velocidades LLDP...
        </div>
      )}

      {/* ── Mobile cards (< md) ── */}
      <div className="md:hidden flex flex-col gap-2">
        {sortData(accessPoints, sortConfig.key, sortConfig.direction).map((ap) => {
          const statusN = normalizeReachability(ap.status);
          const isDormant = /dormant/i.test(ap.status || "");
          const isMesh = ap.isMeshRepeater || false;
          const statusColor = isDormant ? "#94a3b8" : statusN === "connected" ? "#22c55e" : statusN === "warning" ? "#f59e0b" : "#ef4444";
          const expanded = expandedAP === ap.serial;
          const lldpInfo = isMesh
            ? (ap.meshParentName ? `${ap.meshParentName} (Mesh)` : "Mesh Repeater")
            : (ap.connectedTo && ap.connectedTo !== "-" ? ap.connectedTo.replace(/^.*?\s-\s/, "") : "-");

          return (
            <div key={ap.serial} className="bg-white rounded-xl border border-surface-200 overflow-hidden">
              <button
                onClick={() => setExpandedAP(expanded ? null : ap.serial)}
                className="w-full flex items-center gap-3 px-3 py-3 text-left"
              >
                <span style={{ width: 10, height: 10, borderRadius: "50%", background: statusColor, flexShrink: 0 }} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-surface-800 truncate">{ap.name || ap.serial}</div>
                  <div className="text-xs text-surface-500 truncate">{ap.model} · {ap.lanIp || "-"}</div>
                </div>
                <svg className={`w-4 h-4 text-surface-400 transition-transform ${expanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {expanded && (
                <div className="px-3 pb-3 space-y-2 border-t border-surface-100 pt-2">
                  <APConnectivityBar ap={ap} />
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    <span className="text-surface-500">Serial</span>
                    <span className="text-surface-800 font-mono truncate">{ap.serial}</span>
                    <span className="text-surface-500">MAC</span>
                    <span className="text-surface-800 font-mono truncate">{ap.mac || "-"}</span>
                    <span className="text-surface-500">Ethernet 1</span>
                    <span className="text-surface-800 truncate">{formatWiredSpeed(ap.wiredSpeed, isMesh)}</span>
                    <span className="text-surface-500">LLDP</span>
                    <span className="text-surface-800 truncate">{lldpInfo}</span>
                    <span className="text-surface-500">IP</span>
                    <span className="text-surface-800">{ap.lanIp || "-"}</span>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Desktop table (≥ md) ── */}
      <div className="hidden md:block" style={{ overflowX: "auto", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
        <table className="modern-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "960px" }}>
          <thead>
            <tr>
              <SortableHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} align="center" width="5%" />
              <SortableHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={handleSort} align="left" width="9%" />
              <th style={{ textAlign: "left", width: "18%", padding: "10px 10px" }}>Connectivity (UTC-3)</th>
              <SortableHeader label="Serial number" sortKey="serial" sortConfig={sortConfig} onSort={handleSort} align="left" width="11%" />
              <SortableHeader label="Ethernet 1" sortKey="wiredSpeed" sortConfig={sortConfig} onSort={handleSort} align="left" width="10%" />
              <SortableHeader label="Ethernet 1 LLDP" sortKey="connectedTo" sortConfig={sortConfig} onSort={handleSort} align="left" width="14%" />
              <SortableHeader label="MAC address" sortKey="mac" sortConfig={sortConfig} onSort={handleSort} align="left" width="13%" />
              <th style={{ textAlign: "left", width: "10%", padding: "10px 10px" }}>Local IP</th>
            </tr>
          </thead>
          <tbody>
            {sortData(accessPoints, sortConfig.key, sortConfig.direction).map((ap) => {
              const statusN = normalizeReachability(ap.status);
              const isDormant = /dormant/i.test(ap.status || "");
              const isMesh = ap.isMeshRepeater || false;
              const isLowPower = ap.powerMode === "low";
              const lldpInfo = isMesh
                ? (ap.meshParentName ? `${ap.meshParentName} (Mesh)` : "Mesh Repeater")
                : (ap.connectedTo && ap.connectedTo !== "-" ? ap.connectedTo.replace(/^.*?\s-\s/, "") : "-");

              // --- Determinar el estado visual compuesto (como Meraki Dashboard) ---
              // Prioridad: dormant > mesh + status > lowPower > status puro
              type VisualState = "online" | "online-repeater" | "online-mesh" | "alerting" | "alerting-repeater" | "low-power" | "offline" | "dormant";
              let visualState: VisualState = "offline";
              if (isDormant) {
                visualState = "dormant";
              } else if (isMesh && statusN === "connected") {
                // ¿Tiene mesh parent? → Online Repeater (punto verde al centro)
                // ¿No tiene parent identificado? → Mesh (centro vacío)
                visualState = ap.meshParentName ? "online-repeater" : "online-mesh";
              } else if (isMesh && statusN === "warning") {
                visualState = "alerting-repeater";
              } else if (isLowPower && (statusN === "connected" || statusN === "warning")) {
                visualState = "low-power";
              } else if (statusN === "connected") {
                visualState = "online";
              } else if (statusN === "warning") {
                visualState = "alerting";
              } else {
                visualState = isDormant ? "dormant" : "offline";
              }

              // --- Mapear estado visual a colores y estilos ---
              const statusConfig: Record<VisualState, { color: string; bg: string; dashed: boolean; innerStyle: "solid" | "dot" | "empty" | "exclamation"; label: string }> = {
                "online":             { color: "#22c55e", bg: "#d1fae5", dashed: false, innerStyle: "solid",       label: "Online" },
                "online-repeater":    { color: "#22c55e", bg: "transparent", dashed: true, innerStyle: "dot",      label: "Online Repeater" },
                "online-mesh":        { color: "#22c55e", bg: "transparent", dashed: true, innerStyle: "empty",    label: "Online (Mesh)" },
                "alerting":           { color: "#f59e0b", bg: "#fef3c7", dashed: false, innerStyle: "solid",       label: "Alerting" },
                "alerting-repeater":  { color: "#f59e0b", bg: "transparent", dashed: true, innerStyle: "exclamation", label: "Alerting Repeater" },
                "low-power":          { color: "#f59e0b", bg: "#fef3c7", dashed: false, innerStyle: "solid",       label: "Low Power Mode" },
                "offline":            { color: "#ef4444", bg: "#fee2e2", dashed: false, innerStyle: "solid",       label: "Offline" },
                "dormant":            { color: "#94a3b8", bg: "#f1f5f9", dashed: false, innerStyle: "solid",       label: "Dormant" },
              };
              const cfg = statusConfig[visualState];

              // Tooltip descriptivo
              let statusText = cfg.label;
              if (visualState === "alerting") {
                const speed = formatWiredSpeed(ap.wiredSpeed, false);
                if (speed && speed !== "—" && /^(10|100) /i.test(speed)) statusText = `Alerting: Ethernet a ${speed}`;
              } else if (visualState === "low-power") {
                statusText = "Low Power Mode (PoE insuficiente)";
              }

              // Renderizar el inner del ícono
              const renderInner = () => {
                switch (cfg.innerStyle) {
                  case "solid":
                    return <span style={{ width: 9, height: 9, borderRadius: "50%", background: cfg.color }} />;
                  case "dot":
                    return <span style={{ width: 7, height: 7, borderRadius: "50%", background: cfg.color }} />;
                  case "empty":
                    return null; // Centro vacío = solo borde dashed
                  case "exclamation":
                    return <span style={{ fontSize: 12, fontWeight: 900, lineHeight: 1, color: cfg.color, userSelect: "none" }}>!</span>;
                }
              };

              return (
                <tr key={ap.serial}>
                  <td style={{ textAlign: "center", padding: "8px 10px" }}>
                    <Tooltip content={statusText} position="top">
                      <span style={{
                        display: "inline-flex", alignItems: "center", justifyContent: "center",
                        width: 22, height: 22, borderRadius: "50%",
                        background: cfg.bg,
                        border: cfg.dashed ? `2px dashed ${cfg.color}` : "none",
                        cursor: "pointer",
                      }}>
                        {renderInner()}
                      </span>
                    </Tooltip>
                  </td>
                  <td style={{ textAlign: "left", padding: "8px 10px" }}>
                    <Tooltip content={<APTooltipContent ap={ap} />} position="right">
                      <div style={{ fontWeight: "700", color: "#2563eb", fontSize: "14px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", cursor: "pointer" }}>
                        {ap.name || ap.serial}
                      </div>
                    </Tooltip>
                  </td>
                  <td style={{ textAlign: "left", padding: "8px 10px" }}>
                    <APConnectivityBar ap={ap} />
                  </td>
                  <td style={{ textAlign: "left", padding: "8px 10px", fontFamily: "monospace", fontSize: "13px", color: "#1e293b", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ap.serial}
                  </td>
                  <td style={{ textAlign: "left", fontSize: "13px", color: "#1e293b", padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {formatWiredSpeed(ap.wiredSpeed, isMesh)}
                  </td>
                  <td style={{ textAlign: "left", fontSize: "13px", color: "#2563eb", fontWeight: "500", padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {lldpInfo}
                  </td>
                  <td style={{ textAlign: "left", fontFamily: "monospace", fontSize: "12px", color: "#64748b", padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ap.mac || "-"}
                  </td>
                  <td style={{ textAlign: "left", fontSize: "13px", color: "#1e293b", padding: "8px 10px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {ap.lanIp || "-"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
