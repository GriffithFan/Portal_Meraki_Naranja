"use client";
import React, { useState, useMemo } from "react";
import { SwitchPortsGrid } from "./SwitchComponents";
import { SummaryChip } from "./DashboardHelpers";
import { SortableHeader } from "./SortableHeader";
import { normalizeReachability, getStatusColor } from "@/utils/networkUtils";
import Tooltip from "./Tooltip";

/* eslint-disable @typescript-eslint/no-explicit-any */

const STATUS_LABELS: Record<string, string> = {
  connected: "Conectado",
  warning: "Advertencia",
  disconnected: "Desconectado",
  disabled: "Deshabilitado",
};

const getStatusLabel = (rawStatus: string): string => {
  const normalized = normalizeReachability(rawStatus);
  const label = STATUS_LABELS[normalized] || normalized;
  const raw = (rawStatus || "").trim().toLowerCase();
  if (raw && raw !== normalized) return `${label} (${rawStatus})`;
  return label;
};

interface SwitchesSectionProps {
  switchesDetailed: any[];
  sortData: (data: any[], key?: string | null, direction?: "asc" | "desc") => any[];
  sortConfig: { key: string | null; direction: "asc" | "desc" };
  handleSort: (key: string) => void;
}

function SwitchConnectivityBar({ status, availabilityHistory }: { status: string; availabilityHistory?: any[] }) {
  const statusN = normalizeReachability(status);
  const segments = useMemo(() => {
    const numBuckets = 144;
    const bucketSize = 600;
    const now = Math.floor(Date.now() / 1000);
    const windowStart = now - numBuckets * bucketSize;

    // If we have real availability change history, use it
    if (Array.isArray(availabilityHistory) && availabilityHistory.length > 0) {
      // Sort events chronologically
      // details.new es un array [{name, value}] en la API Meraki, NO un objeto
      const getStatus = (e: any): string => {
        if (Array.isArray(e.details?.new)) {
          const found = e.details.new.find((d: any) => d.name === "status");
          if (found) return found.value;
        }
        if (typeof e.details?.new === "object" && e.details.new?.status) return e.details.new.status;
        return "online";
      };
      const events = availabilityHistory
        .map((e: any) => ({ ts: Math.floor(new Date(e.ts).getTime() / 1000), newStatus: getStatus(e) }))
        .sort((a: any, b: any) => a.ts - b.ts);

      // Determine initial status (status before the first event in window)
      let initialStatus = "online";
      for (const evt of events) {
        if (evt.ts <= windowStart) initialStatus = evt.newStatus;
      }

      return Array.from({ length: numBuckets }, (_, i) => {
        const bucketStart = windowStart + i * bucketSize;
        const bucketEnd = bucketStart + bucketSize;
        const startDate = new Date(bucketStart * 1000);
        const endDate = new Date(bucketEnd * 1000);
        const fmt = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

        // Find last known status before this bucket
        let currentStatus = initialStatus;
        for (const evt of events) {
          if (evt.ts <= bucketStart) currentStatus = evt.newStatus;
        }
        // Check transitions within the bucket
        let hadOffline = false;
        for (const evt of events) {
          if (evt.ts > bucketStart && evt.ts < bucketEnd) {
            if (/offline|dormant/i.test(evt.newStatus)) hadOffline = true;
          }
        }

        const isOnline = /online|ready/i.test(currentStatus);
        const isAlerting = /alerting/i.test(currentStatus);
        let color: string;
        let label: string;
        if (hadOffline) { color = "#f59e0b"; label = "Transición (cambio de estado)"; }
        else if (isOnline) { color = "#22c55e"; label = "Conectado"; }
        else if (isAlerting) { color = "#f59e0b"; label = "Advertencia"; }
        else { color = "#ef4444"; label = "Sin conectividad"; }
        return { color, tooltip: `${label}\n${fmt(startDate)} - ${fmt(endDate)}` };
      });
    }

    // Fallback: synthetic segments based on current status
    const isOnline = statusN === "connected";
    const isWarning = statusN === "warning";
    return Array.from({ length: numBuckets }, (_, i) => {
      const bucketStart = now - (numBuckets - i) * bucketSize;
      const startDate = new Date(bucketStart * 1000);
      const endDate = new Date((bucketStart + bucketSize) * 1000);
      const fmt = (d: Date) => d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
      const color = isOnline ? "#22c55e" : isWarning ? "#f59e0b" : "#ef4444";
      const label = isOnline ? "Conectado" : isWarning ? "Advertencia" : "Sin conectividad";
      return { color, tooltip: `${label}\n${fmt(startDate)} - ${fmt(endDate)}` };
    });
  }, [statusN, availabilityHistory]);
  return (
    <div className="flex h-2.5 rounded overflow-hidden border border-surface-300 bg-red-500">
      {segments.map((seg, i) => (
        <div key={i} className="flex-1 min-w-px cursor-help" style={{ background: seg.color }} title={seg.tooltip} />
      ))}
    </div>
  );
}

function SwitchTooltipContent({ sw, isExpanded }: { sw: any; isExpanded: boolean }) {
  const ti = sw.tooltipInfo || {};
  const connectedPorts = ti.connectedPorts ?? (sw.ports || []).filter((p: any) => (p.status || "").toLowerCase() === "connected").length;
  const totalPorts = ti.totalPorts ?? (sw.ports || []).length;
  const poePorts = ti.poePorts ?? (sw.ports || []).filter((p: any) => p.poeEnabled).length;
  const poeActive = ti.poeActivePorts ?? (sw.ports || []).filter((p: any) => p.poeEnabled && (p.status || "").toLowerCase() === "connected").length;

  return (
    <div>
      <div className="tooltip-title">{sw.name || sw.serial}</div>
      <div className="tooltip-row"><span className="tooltip-label">Modelo</span><span className="tooltip-value">{sw.model}</span></div>
      <div className="tooltip-row"><span className="tooltip-label">Serial</span><span className="tooltip-value">{sw.serial}</span></div>
      {sw.mac && <div className="tooltip-row"><span className="tooltip-label">MAC</span><span className="tooltip-value">{sw.mac}</span></div>}
      {sw.firmware && <div className="tooltip-row"><span className="tooltip-label">Firmware</span><span className="tooltip-value">{sw.firmware}</span></div>}
      <div className="tooltip-row"><span className="tooltip-label">LAN IP</span><span className="tooltip-value">{sw.lanIp || "N/A"}</span></div>
      {totalPorts > 0 && (
        <div className="tooltip-row"><span className="tooltip-label">Puertos activos</span><span className="tooltip-value">{connectedPorts}/{totalPorts}</span></div>
      )}
      {poePorts > 0 && (
        <div className="tooltip-row"><span className="tooltip-label">PoE</span><span className="tooltip-value">{poeActive}/{poePorts} activos</span></div>
      )}
      {sw.connectedTo && sw.connectedTo !== "-" && (
        <>
          <div className="tooltip-row"><span className="tooltip-label">Conectado a</span><span className="tooltip-value">{sw.connectedTo}</span></div>
          <div className="tooltip-row"><span className="tooltip-label">Detección</span><span className="tooltip-value">{ti.detectionMethod || "LLDP"}</span></div>
        </>
      )}
      <div className="mt-2 text-[11px] text-surface-400 italic">
        Click para {isExpanded ? "ocultar" : "ver"} puertos
      </div>
    </div>
  );
}

export default function SwitchesSection({ switchesDetailed, sortData, sortConfig, handleSort }: SwitchesSectionProps) {
  const [expandedSwitch, setExpandedSwitch] = useState<string | null>(null);
  const switchesData = Array.isArray(switchesDetailed) ? switchesDetailed : [];

  if (!switchesData.length) return <div className="p-3 text-surface-500">No hay switches para esta red</div>;

  const online = switchesData.filter((sw) => normalizeReachability(sw.status) === "connected").length;
  const warning = switchesData.filter((sw) => normalizeReachability(sw.status) === "warning").length;
  const offline = switchesData.filter((sw) => normalizeReachability(sw.status) === "disconnected").length;

  const sorted = sortData(switchesData, sortConfig.key, sortConfig.direction);

  return (
    <div className="flex flex-col gap-[18px] overflow-visible">
      <h2 className="m-0 mb-3 text-surface-800 text-xl font-semibold border-b-2 border-surface-300 pb-3">Switches</h2>

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2 sm:gap-3 mb-5 p-3 sm:p-3.5 bg-surface-100 rounded-[10px]">
        <SummaryChip label="Total Switches" value={switchesData.length} accent="#1f2937" />
        <SummaryChip label="Online" value={online} accent="#22c55e" />
        <SummaryChip label="Advertencia" value={warning} accent="#f59e0b" />
        <SummaryChip label="Offline" value={offline} accent="#ef4444" />
      </div>

      {/* ═══════ MOBILE: cards expandibles (< md) ═══════ */}
      <div className="flex flex-col gap-3 md:hidden">
        {sorted.map((sw) => {
          const statusColor = getStatusColor(sw.status);
          const statusN = normalizeReachability(sw.status);
          const isExpanded = expandedSwitch === sw.serial;
          const ports = sw.ports || [];
          const swCrcCount = sw.crcErrorPorts != null
            ? sw.crcErrorPorts
            : ports.filter((p: any) => Array.isArray(p.warnings) && p.warnings.some((w: string) => /crc/i.test(w))).length;
          const connectedPorts = ports.filter((p: any) => (p.status || "").toLowerCase() === "connected").length;

          return (
            <div key={sw.serial} className="bg-white border border-surface-200 rounded-xl overflow-hidden shadow-sm">
              {/* Card header — tappable */}
              <button
                type="button"
                className="w-full text-left px-4 py-3 flex items-start gap-3 bg-transparent border-0 cursor-pointer active:bg-surface-50"
                onClick={() => setExpandedSwitch(isExpanded ? null : sw.serial)}
              >
                {/* Status dot */}
                <span title={getStatusLabel(sw.status)} className={`mt-0.5 shrink-0 inline-flex items-center justify-center w-[22px] h-[22px] rounded-full ${statusN === "connected" ? "bg-green-100" : statusN === "warning" ? "bg-amber-100" : statusN === "disconnected" ? "bg-red-100" : "bg-surface-100"}`}>
                  <span className="w-[9px] h-[9px] rounded-full" style={{ background: statusColor }} />
                </span>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-blue-600 text-sm truncate">{sw.name || sw.serial}</span>
                    {swCrcCount > 0 && (
                      <span className="shrink-0 inline-flex items-center gap-[2px] bg-orange-50 border border-amber-500 rounded px-1 py-px text-[10px] font-semibold text-amber-800">
                        <svg width="8" height="7" viewBox="0 0 16 14" fill="none"><path d="M7.07 1.5L1.07 11.5A1 1 0 0 0 2 13H14a1 1 0 0 0 .93-1.5L8.93 1.5a1 1 0 0 0-1.86 0Z" fill="#fef3c7" stroke="#e8960c" strokeWidth="1.5"/><text x="8" y="10.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#92400e">!</text></svg>
                        CRC {swCrcCount > 1 ? `(${swCrcCount})` : ""}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-surface-500 mt-0.5">{sw.model} · {sw.serial}</div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-[11px] text-surface-500">
                    <span>IP: <span className="font-mono font-medium text-surface-600">{sw.lanIp || "—"}</span></span>
                    <span>Puertos: <span className="font-medium text-surface-700">{connectedPorts}/{ports.length}</span></span>
                    {sw.mac && <span className="font-mono">{sw.mac}</span>}
                  </div>
                  {/* Connectivity bar */}
                  <div className="mt-2">
                    <SwitchConnectivityBar status={sw.status} availabilityHistory={sw.availabilityHistory} />
                  </div>
                </div>

                {/* Chevron */}
                <span className={`mt-1 shrink-0 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                  <svg width="10" height="10" viewBox="0 0 8 8" fill="none"><path d="M1.5 1 L7 4 L1.5 7 Z" fill="#94a3b8"/></svg>
                </span>
              </button>

              {/* Expanded: port grid with horizontal scroll */}
              {isExpanded && (
                <div className="border-t border-surface-200 bg-surface-50 px-3 py-3">
                  <h4 className="m-0 mb-2 text-sm text-surface-800 font-semibold">Ports</h4>
                  {ports.length > 0 ? (
                    <div className="overflow-x-auto -mx-1 px-1 pb-1">
                      <SwitchPortsGrid ports={ports} />
                    </div>
                  ) : (
                    <div className="text-surface-400 text-xs">Sin información de puertos.</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ═══════ DESKTOP: tabla expandible (>= md) ═══════ */}
      <div className="hidden md:block overflow-x-auto overflow-y-visible rounded-xl border border-surface-300">
            <table className="modern-table" style={{ tableLayout: "fixed", width: "100%", minWidth: "880px" }}>
              <thead>
                <tr>
                  <SortableHeader label="Status" sortKey="status" sortConfig={sortConfig} onSort={handleSort} align="center" width="8%" />
                  <SortableHeader label="Name" sortKey="name" sortConfig={sortConfig} onSort={handleSort} align="left" width="18%" />
                  <SortableHeader label="Model" sortKey="model" sortConfig={sortConfig} onSort={handleSort} align="left" width="12%" />
                  <SortableHeader label="Serial" sortKey="serial" sortConfig={sortConfig} onSort={handleSort} align="left" width="15%" />
                  <th style={{ textAlign: "left", width: "22%" }}>Connectivity (UTC-3)</th>
                  <SortableHeader label="MAC address" sortKey="mac" sortConfig={sortConfig} onSort={handleSort} align="left" width="15%" />
                  <SortableHeader label="LAN IP" sortKey="lanIp" sortConfig={sortConfig} onSort={handleSort} align="left" width="10%" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((sw) => {
                  const statusColor = getStatusColor(sw.status);
                  const statusN = normalizeReachability(sw.status);
                  const isExpanded = expandedSwitch === sw.serial;
                  const ports = sw.ports || [];

                  const swCrcCount = sw.crcErrorPorts != null
                    ? sw.crcErrorPorts
                    : ports.filter((p: any) => Array.isArray(p.warnings) && p.warnings.some((w: string) => /crc/i.test(w))).length;

                  return (
                    <React.Fragment key={sw.serial}>
                      <tr
                        className={`cursor-pointer transition-colors duration-200 ${isExpanded ? "bg-blue-50" : "hover:bg-surface-50"}`}
                        onClick={() => setExpandedSwitch(isExpanded ? null : sw.serial)}
                      >
                        <td className="text-center px-1.5 py-2.5">
                          <div className="inline-flex flex-col items-center gap-[3px]">
                            <Tooltip content={<span>{getStatusLabel(sw.status)}</span>} position="auto">
                              <span className={`inline-flex items-center justify-center w-[22px] h-[22px] rounded-full cursor-help ${statusN === "connected" ? "bg-green-100" : statusN === "warning" ? "bg-amber-100" : statusN === "disconnected" ? "bg-red-100" : "bg-surface-100"}`}>
                                <span className="w-[9px] h-[9px] rounded-full" style={{ background: statusColor }} />
                              </span>
                            </Tooltip>
                            {swCrcCount > 0 && (
                              <Tooltip content={
                                <div>
                                  <div className="font-bold text-amber-500">CRC Errors</div>
                                  <div>Puertos afectados: {swCrcCount}</div>
                                </div>
                              } position="auto">
                                <span className="inline-flex items-center justify-center w-[18px] h-[18px] cursor-default">
                                  <svg width="16" height="14" viewBox="0 0 16 14" fill="none">
                                    <path d="M7.07 1.5L1.07 11.5A1 1 0 0 0 2 13H14a1 1 0 0 0 .93-1.5L8.93 1.5a1 1 0 0 0-1.86 0Z" fill="#fef3c7" stroke="#e8960c" strokeWidth="1.2"/>
                                    <text x="8" y="10.5" textAnchor="middle" fontSize="7" fontWeight="700" fill="#92400e">!</text>
                                  </svg>
                                </span>
                              </Tooltip>
                            )}
                          </div>
                        </td>
                        <td className="text-left text-sm px-3 py-2.5 overflow-visible relative">
                          <Tooltip content={<SwitchTooltipContent sw={sw} isExpanded={isExpanded} />} position="auto">
                            <span className="text-blue-600 font-bold cursor-pointer inline-flex items-center gap-1.5 relative z-[1]">
                              <span className={`inline-flex items-center justify-center w-4 h-4 transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" aria-hidden="true">
                  <path d="M1.5 1 L7 4 L1.5 7 Z" fill="#64748b"/>
                </svg>
              </span>
                              {sw.name || sw.serial}
                              {swCrcCount > 0 && (
                                <span className="inline-flex items-center gap-[3px] bg-orange-50 border border-amber-500 rounded-md px-1.5 py-px text-[11px] font-semibold text-amber-800 whitespace-nowrap ml-1">
                                  <svg width="10" height="9" viewBox="0 0 16 14" fill="none" className="shrink-0">
                                    <path d="M7.07 1.5L1.07 11.5A1 1 0 0 0 2 13H14a1 1 0 0 0 .93-1.5L8.93 1.5a1 1 0 0 0-1.86 0Z" fill="#fef3c7" stroke="#e8960c" strokeWidth="1.5"/>
                                    <text x="8" y="10.5" textAnchor="middle" fontSize="8" fontWeight="700" fill="#92400e">!</text>
                                  </svg>
                                  CRC {swCrcCount > 1 ? `(${swCrcCount})` : ""}
                                </span>
                              )}
                            </span>
                          </Tooltip>
                        </td>
                        <td className="text-[13px] text-surface-500 px-3 py-2.5">{sw.model || "-"}</td>
                        <td className="font-mono text-[13px] text-surface-500 px-3 py-2.5">{sw.serial}</td>
                        <td className="px-3 py-2.5">
                          <SwitchConnectivityBar status={sw.status} availabilityHistory={sw.availabilityHistory} />
                        </td>
                        <td className="font-mono text-xs text-surface-500 px-3 py-2.5">{sw.mac || "-"}</td>
                        <td className="font-mono text-[13px] text-surface-600 font-medium px-3 py-2.5">{sw.lanIp || "-"}</td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td colSpan={7} className="px-6 py-4 bg-surface-50 border-t border-surface-200">
                            <h4 className="m-0 mb-3 text-base text-surface-800 font-semibold">Ports</h4>
                            {ports.length > 0 ? (
                              <SwitchPortsGrid ports={ports} />
                            ) : (
                              <div className="text-surface-400 text-[13px]">No hay información de puertos disponible para este switch.</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
    </div>
  );
}
