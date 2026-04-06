"use client";
import React, { useState, useMemo, useCallback } from "react";
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
    <div className="connectivity-bar flex h-2.5 rounded overflow-hidden border border-surface-300">
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

/* ── Cable Test Panel ──────────────────────────────────── */

interface CableTestResult {
  port: string;
  status: string;
  speedMbps?: number;
  error?: string;
  pairs?: { index: number; status: string; lengthMeters: number }[];
}

function CableTestPanel({ serial, onClose }: { serial: string; onClose: () => void }) {
  const [portsInput, setPortsInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<CableTestResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const parsePorts = useCallback((input: string): string[] => {
    const ports: string[] = [];
    const parts = input.split(",").map(s => s.trim()).filter(Boolean);
    for (const part of parts) {
      if (part.includes("-")) {
        const [startStr, endStr] = part.split("-").map(s => s.trim());
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && start > 0 && end > 0 && end >= start && end <= 48) {
          for (let i = start; i <= end; i++) ports.push(String(i));
        }
      } else {
        const num = parseInt(part, 10);
        if (!isNaN(num) && num > 0 && num <= 48) ports.push(String(num));
      }
    }
    return Array.from(new Set(ports));
  }, []);

  const runTest = useCallback(async () => {
    const ports = parsePorts(portsInput);
    if (ports.length === 0) { setError("Ingresá puertos válidos, ej: 1-9 o 1,5,8"); return; }
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      const res = await fetch(`/api/meraki/devices/${encodeURIComponent(serial)}/cable-test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ ports }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || "Error al iniciar test"); }
      const job = await res.json();
      const cableTestId = job.cableTestId;
      // Poll until complete (max 30s)
      for (let attempt = 0; attempt < 15; attempt++) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`/api/meraki/devices/${encodeURIComponent(serial)}/cable-test?id=${encodeURIComponent(cableTestId)}`, { credentials: "include" });
        if (!pollRes.ok) continue;
        const pollData = await pollRes.json();
        if (pollData.status === "complete") {
          setResults(pollData.results || []);
          setLoading(false);
          return;
        }
        if (pollData.error) { throw new Error(pollData.error); }
      }
      throw new Error("Timeout: el test no completó en 30 segundos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error desconocido");
    } finally {
      setLoading(false);
    }
  }, [serial, portsInput, parsePorts]);

  const STATUS_COLOR: Record<string, string> = { ok: "text-green-600", abnormal: "text-red-600", open: "text-amber-600", short: "text-red-600", unknown: "text-surface-400" };
  const PORT_STATUS_COLOR: Record<string, string> = { up: "text-green-600 font-bold", down: "text-red-600", unknown: "text-surface-400" };

  return (
    <div className="mt-4 border border-surface-200 rounded-lg bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 bg-surface-50 border-b border-surface-200">
        <h5 className="m-0 text-sm font-semibold text-surface-800 flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
          </svg>
          Cable Test
        </h5>
        <button onClick={onClose} className="text-surface-400 hover:text-surface-600 transition-colors" title="Cerrar">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
        </button>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-center gap-2 mb-1">
          <input
            type="text"
            value={portsInput}
            onChange={e => setPortsInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !loading) runTest(); }}
            placeholder="Ej: 1-9  o  1,5,8"
            className="flex-1 text-sm border border-surface-300 rounded-md px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            disabled={loading}
          />
          <button
            onClick={runTest}
            disabled={loading || !portsInput.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:bg-surface-300 disabled:text-surface-500 disabled:cursor-not-allowed transition-colors flex items-center gap-1.5"
          >
            {loading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Testeando...
              </>
            ) : "Run cable test"}
          </button>
        </div>
        <p className="text-[11px] text-surface-400 mb-0">
          Usá &quot;-&quot; para rangos (1-9) y &quot;,&quot; para puertos individuales (1,5,8). Se pueden combinar: 1-4,7,10-12
        </p>

        {error && (
          <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded-md text-xs text-red-700">{error}</div>
        )}

        {results && results.length > 0 && (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b-2 border-surface-200 text-surface-600">
                  <th className="text-left px-2 py-2 font-semibold">Port</th>
                  <th className="text-left px-2 py-2 font-semibold">Link</th>
                  <th className="text-left px-2 py-2 font-semibold">Length</th>
                  <th className="text-left px-2 py-2 font-semibold">Status</th>
                  <th className="text-center px-2 py-2 font-semibold">Pair 1</th>
                  <th className="text-center px-2 py-2 font-semibold">Pair 2</th>
                  <th className="text-center px-2 py-2 font-semibold">Pair 3</th>
                  <th className="text-center px-2 py-2 font-semibold">Pair 4</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const pairs = r.pairs || [];
                  const maxLen = pairs.length > 0 ? Math.max(...pairs.map(p => p.lengthMeters || 0)) : 0;
                  const speed = r.speedMbps ? (r.speedMbps >= 1000 ? `${r.speedMbps / 1000}Gfdx` : `${r.speedMbps}fdx`) : "—";
                  return (
                    <tr key={i} className="border-b border-surface-100 hover:bg-surface-50">
                      <td className="px-2 py-1.5 text-blue-600 font-medium">{r.port}</td>
                      <td className="px-2 py-1.5 text-surface-600">{speed}</td>
                      <td className="px-2 py-1.5 text-surface-600">{maxLen > 0 ? `${maxLen} m` : "—"}</td>
                      <td className={`px-2 py-1.5 font-bold ${PORT_STATUS_COLOR[r.status] || "text-surface-600"}`}>{r.status === "up" ? "OK" : r.status?.toUpperCase()}</td>
                      {[0, 1, 2, 3].map(idx => {
                        const pair = pairs.find(p => p.index === idx);
                        const st = pair?.status || "-";
                        return <td key={idx} className={`text-center px-2 py-1.5 ${STATUS_COLOR[st] || "text-surface-500"}`}>{st}</td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {results && results.length === 0 && (
          <div className="mt-3 text-xs text-surface-400 text-center py-2">Sin resultados</div>
        )}
      </div>
    </div>
  );
}

export default function SwitchesSection({ switchesDetailed, sortData, sortConfig, handleSort }: SwitchesSectionProps) {
  const [expandedSwitch, setExpandedSwitch] = useState<string | null>(null);
  const [cableTestSerial, setCableTestSerial] = useState<string | null>(null);
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
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="m-0 text-sm text-surface-800 font-semibold">Ports</h4>
                    <button
                      onClick={(e) => { e.stopPropagation(); setCableTestSerial(cableTestSerial === sw.serial ? null : sw.serial); }}
                      className="text-[11px] text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
                      </svg>
                      Cable Test
                    </button>
                  </div>
                  {ports.length > 0 ? (
                    <div className="overflow-x-auto -mx-1 px-1 pb-1">
                      <SwitchPortsGrid ports={ports} />
                    </div>
                  ) : (
                    <div className="text-surface-400 text-xs">Sin información de puertos.</div>
                  )}
                  {cableTestSerial === sw.serial && (
                    <CableTestPanel serial={sw.serial} onClose={() => setCableTestSerial(null)} />
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
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="m-0 text-base text-surface-800 font-semibold">Ports</h4>
                              <button
                                onClick={(e) => { e.stopPropagation(); setCableTestSerial(cableTestSerial === sw.serial ? null : sw.serial); }}
                                className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1.5 transition-colors"
                              >
                                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.636 18.364a9 9 0 010-12.728m12.728 0a9 9 0 010 12.728m-9.9-2.829a5 5 0 010-7.07m7.072 0a5 5 0 010 7.07M13 12a1 1 0 11-2 0 1 1 0 012 0z" />
                                </svg>
                                Cable Test
                              </button>
                            </div>
                            {ports.length > 0 ? (
                              <SwitchPortsGrid ports={ports} />
                            ) : (
                              <div className="text-surface-400 text-[13px]">No hay información de puertos disponible para este switch.</div>
                            )}
                            {cableTestSerial === sw.serial && (
                              <CableTestPanel serial={sw.serial} onClose={() => setCableTestSerial(null)} />
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
