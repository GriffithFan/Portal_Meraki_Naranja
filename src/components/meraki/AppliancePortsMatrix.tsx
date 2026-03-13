"use client";
import { useMemo } from "react";
import "./AppliancePorts.css";
import Tooltip from "./Tooltip";
import {
  getModelLayout,
  parsePortNumber,
  normalizeReachability,
  createPlaceholderPort,
  getPortAlias,
  formatSpeed,
  buildPortClassName,
  isPoEPort,
  buildColumns,
} from "./AppliancePortsUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function PortTooltipContent({ port, isWanPort }: { port: any; isWanPort: boolean }) {
  const uplink = port.uplink || {};
  const isDisconnected = !port.hasCarrier && (port.statusNormalized === "disconnected" || port.status === "Disconnected" || (!port.uplink && !port.connection && !port.tooltipInfo));

  if (port?.tooltipInfo) {
    const ti = port.tooltipInfo;
    return (
      <div>
        <div className="tooltip-title">Port {port.number || port.displayNumber}</div>
        {(ti.type === "lan-switch-connection" || ti.type === "lan-ap-connection") ? (
          <>
            <div className="tooltip-row"><span className="tooltip-label">Device</span><span className="tooltip-value">{ti.deviceName}</span></div>
            <div className="tooltip-row"><span className="tooltip-label">Serial</span><span className="tooltip-value">{ti.deviceSerial}</span></div>
            <div className="tooltip-row"><span className="tooltip-label">Type</span><span className="tooltip-value">{ti.deviceType === "ap" ? "Access Point" : "Switch"}</span></div>
            {ti.devicePort && ti.devicePort !== "-" && <div className="tooltip-row"><span className="tooltip-label">Remote port</span><span className="tooltip-value">Port {ti.devicePort}</span></div>}
            <div className="tooltip-row"><span className="tooltip-label">Detection</span><span className="tooltip-value">{ti.detectionMethod || "LLDP"}</span></div>
            <div className="tooltip-row"><span className="tooltip-label">Speed</span><span className="tooltip-value">{formatSpeed(ti.speed || port.speedLabel || port.speed || port.connection?.speed) || "1 Gbps"}</span></div>
            {(port.duplex || ti.duplex) && <div className="tooltip-row"><span className="tooltip-label">Duplex</span><span className="tooltip-value">{((port.duplex || ti.duplex || "full").charAt(0).toUpperCase() + (port.duplex || ti.duplex || "full").slice(1))} duplex</span></div>}
            <div className="tooltip-row"><span className="tooltip-label">Status</span><span className={`tooltip-badge ${ti.status === "connected" ? "success" : ti.status === "warning" ? "warning" : "error"}`}>{ti.status}</span></div>
          </>
        ) : (
          <>
            <div className="tooltip-row"><span className="tooltip-label">Role</span><span className="tooltip-value">{port.role || port.type || "LAN"}</span></div>
            {port.status && <div className="tooltip-row"><span className="tooltip-label">Status</span><span className="tooltip-value">{port.status}</span></div>}
            {(port.speed || port.speedLabel) && <div className="tooltip-row"><span className="tooltip-label">Speed</span><span className="tooltip-value">{port.speedLabel || port.speed}</span></div>}
          </>
        )}
      </div>
    );
  }

  if (isWanPort) {
    return (
      <div>
        <div className="tooltip-title">{uplink.interface?.toUpperCase() || `WAN ${port.number || port.displayNumber}`}</div>
        <div className="tooltip-row"><span className="tooltip-label">Status</span><span className={`tooltip-badge ${port.statusNormalized === "connected" ? "success" : port.statusNormalized === "warning" ? "warning" : port.statusNormalized === "disconnected" ? "error" : ""}`}>{port.status || uplink.status || "Unknown"}</span></div>
        {uplink.ip && <div className="tooltip-row"><span className="tooltip-label">IP Address</span><span className="tooltip-value">{uplink.ip}</span></div>}
        {uplink.publicIp && <div className="tooltip-row"><span className="tooltip-label">Public IP</span><span className="tooltip-value">{uplink.publicIp}</span></div>}
        {uplink.gateway && <div className="tooltip-row"><span className="tooltip-label">Gateway</span><span className="tooltip-value">{uplink.gateway}</span></div>}
        {uplink.provider && <div className="tooltip-row"><span className="tooltip-label">Provider</span><span className="tooltip-value">{uplink.provider}</span></div>}
        {uplink.latency != null && <div className="tooltip-row"><span className="tooltip-label">Latency</span><span className="tooltip-value">{uplink.latency} ms</span></div>}
        {uplink.loss != null && <div className="tooltip-row"><span className="tooltip-label">Packet Loss</span><span className={`tooltip-value ${uplink.loss > 0 ? "text-warning" : ""}`}>{uplink.loss}%</span></div>}
        {uplink.jitter != null && <div className="tooltip-row"><span className="tooltip-label">Jitter</span><span className="tooltip-value">{uplink.jitter} ms</span></div>}
        {(port.speedLabel || uplink.speedLabel || uplink.speed || uplink.throughput) && <div className="tooltip-row"><span className="tooltip-label">Speed</span><span className="tooltip-value">{port.speedLabel || uplink.speedLabel || uplink.speed || uplink.throughput}</span></div>}
        {uplink.connectionType && <div className="tooltip-row"><span className="tooltip-label">Connection</span><span className="tooltip-value">{uplink.connectionType}</span></div>}
      </div>
    );
  }

  if (port.connection) {
    return (
      <div>
        <div className="tooltip-title">Port {port.number || port.displayNumber}</div>
        <div className="tooltip-row"><span className="tooltip-label">Connected to</span><span className="tooltip-value">{port.connection.deviceName || "Device"}</span></div>
        {port.connection.deviceSerial && <div className="tooltip-row"><span className="tooltip-label">Serial</span><span className="tooltip-value">{port.connection.deviceSerial}</span></div>}
        {port.connection.remotePort && <div className="tooltip-row"><span className="tooltip-label">Remote Port</span><span className="tooltip-value">Port {port.connection.remotePort}</span></div>}
        <div className="tooltip-row"><span className="tooltip-label">Speed</span><span className="tooltip-value">{formatSpeed(port.connection.speed || port.speedLabel || port.speed) || "1 Gbps"}</span></div>
        {(port.duplex || port.connection.duplex) && <div className="tooltip-row"><span className="tooltip-label">Duplex</span><span className="tooltip-value">{((port.duplex || port.connection.duplex || "full").charAt(0).toUpperCase() + (port.duplex || port.connection.duplex || "full").slice(1))} duplex</span></div>}
        <div className="tooltip-row"><span className="tooltip-label">Status</span><span className="tooltip-badge success">Connected</span></div>
      </div>
    );
  }

  if (isDisconnected) {
    return (
      <div>
        <div className="tooltip-title">Port {port.number || port.displayNumber}</div>
        <div className="tooltip-row"><span className="tooltip-label">Status</span><span className="tooltip-badge error">Disconnected</span></div>
      </div>
    );
  }

  // Fallback: simple connected port with speed/duplex (matches Meraki's "Port connected, 1 Gbps, Full duplex")
  const speed = formatSpeed(port.speed || port.speedLabel || port.linkSpeed);
  const duplex = port.duplex || port.linkDuplex;
  const normalized = normalizeReachability(port.statusNormalized || port.status);
  const isConnected = normalized === "connected" || port.hasCarrier;

  return (
    <div>
      <div className="tooltip-title">Port {port.number || port.displayNumber}</div>
      <div className="tooltip-row"><span className="tooltip-label">Status</span><span className={`tooltip-badge ${isConnected ? "success" : ""}`}>{isConnected ? "Port connected" : port.status || "Unknown"}</span></div>
      {speed && <div className="tooltip-row"><span className="tooltip-label">Speed</span><span className="tooltip-value">{speed}</span></div>}
      {duplex && <div className="tooltip-row"><span className="tooltip-label">Duplex</span><span className="tooltip-value">{duplex.charAt(0).toUpperCase() + duplex.slice(1)} duplex</span></div>}
    </div>
  );
}

function NodePortIcon({ port, rotated = false }: { port: any; rotated?: boolean }) {
  if (!port) return null;
  const isWanPort = port.role === "wan" || port.type === "wan" || !!port.uplink;
  return (
    <Tooltip content={<PortTooltipContent port={port} isWanPort={isWanPort} />} position="top">
      <svg viewBox="0 0 30 25" preserveAspectRatio="none" className={buildPortClassName(port, { rotated })}>
        <g><polygon points="5,9 9,9 9,6 12,6 12,3 18,3 18,6 21,6 21,9 25,9 25,21 5,21" /></g>
      </svg>
    </Tooltip>
  );
}

function NodePortIconSfp({ port, rotated = false }: { port: any; rotated?: boolean }) {
  if (!port) return null;
  const isWanPort = port.role === "wan" || port.type === "wan" || !!port.uplink;
  return (
    <Tooltip content={<PortTooltipContent port={port} isWanPort={isWanPort} />} position="top">
      <svg viewBox="0 0 30 25" preserveAspectRatio="none" className={buildPortClassName(port, { rotated })}>
        <polygon points="4,5 26,5 26,21 19,21 19,17 11,17 11,21 4,21" />
      </svg>
    </Tooltip>
  );
}

function NodePort({ port, rotated = false }: { port: any; rotated?: boolean }) {
  if (!port) return null;
  const typeText = [port.formFactor, port.medium, port.type].map((v) => (v || "").toString().toLowerCase());
  if (typeText.some((i) => i.includes("sfp") || i.includes("fiber"))) return <NodePortIconSfp port={port} rotated={rotated} />;
  return <NodePortIcon port={port} rotated={rotated} />;
}

interface AppliancePortsMatrixProps {
  ports?: any[];
  model?: string;
  uplinks?: any[];
  connectedOverrides?: any[];
  networkName?: string;
  deviceCount?: any;
}

export default function AppliancePortsMatrix({ ports = [], model = "", uplinks = [], connectedOverrides = [], networkName = "", deviceCount = {} }: AppliancePortsMatrixProps) {
  const { management, columns } = useMemo(() => buildColumns(ports, model, uplinks, connectedOverrides), [ports, model, uplinks, connectedOverrides]);

  const layout = getModelLayout(model);
  const hasContent = management.length || columns.some((c: any) => c.top || c.bottom);
  const shouldRenderFallback = !hasContent && layout;
  if (!hasContent && !shouldRenderFallback) return null;

  const isZ3 = model && model.toString().trim().toUpperCase().startsWith("Z3");
  const wanColumnCount = columns.filter((c: any) => c.group === "wan").length;

  const fallbackColumns = shouldRenderFallback ? (layout.columns || []).map((col: any) => {
    const topRaw = col.top ?? null;
    const bottomRaw = col.bottom ?? null;
    const topNum = topRaw && (topRaw.number ?? topRaw) ? parsePortNumber(topRaw.number ?? topRaw) : null;
    const bottomNum = bottomRaw && (bottomRaw.number ?? bottomRaw) ? parsePortNumber(bottomRaw.number ?? bottomRaw) : null;
    return { group: col.kind === "wan" ? "wan" : "lan", label: col.label || "", top: topNum !== null ? createPlaceholderPort({ number: topNum, displayNumber: col.top?.displayNumber || null, overrides: col.top?.overrides || {} }) : null, bottom: bottomNum !== null ? createPlaceholderPort({ number: bottomNum, displayNumber: col.bottom?.displayNumber || null, overrides: col.bottom?.overrides || {} }) : null };
  }) : null;
  const effectiveColumns = shouldRenderFallback ? fallbackColumns : columns;
  if (!effectiveColumns || !Array.isArray(effectiveColumns)) return null;

  const managementCellClass = management.length ? "NodePortCell lastOfMiniGroup" : "NodePortCell";
  const classForColumn = (column: any, index: number) => { if (column.group !== "wan") return "NodePortCell"; const wanIndex = columns.slice(0, index + 1).filter((i: any) => i.group === "wan").length - 1; return wanIndex === wanColumnCount - 1 ? "NodePortCell lastOfGroup" : "NodePortCell"; };

  const formatVisiblePortNumber = (port: any, group: string) => {
    if (!port) return "";
    const isUSAP = (networkName && networkName.toUpperCase().includes("USAP")) || (deviceCount.aps > 3 && deviceCount.hasMX);
    const isMX = model && model.toUpperCase().startsWith("MX");
    if (isUSAP && isMX && group === "wan") { const alias = getPortAlias(port, networkName, model, group, deviceCount) || ""; if (alias.startsWith("Wan")) return alias; }
    const numeric = parsePortNumber(port.number ?? port.displayNumber);
    if (numeric !== null) return numeric;
    if (group === "wan") { const alias = getPortAlias(port, networkName, model, group, deviceCount) || ""; const m = alias.toString().match(/(\d+)$/); if (m) return Number(m[1]); }
    return port.displayNumber || port.number || "";
  };

  return (
    <div className={`PortMatrixWrapper ${isZ3 ? "PortMatrixWrapper--z3" : ""}`}>
      {shouldRenderFallback && <div style={{ marginBottom: 8, padding: "6px 10px", background: "#fff7ed", border: "1px solid #fcd34d", borderRadius: 6, color: "#92400e", fontSize: 12 }}>Using layout fallback for model: {model || "unknown"}</div>}
      <span className="NodePortTableSpan" data-testid="appliance-port-matrix">
        <table className="NodePortTable">
          <tbody>
            <tr>
              <td className={managementCellClass} />
              {effectiveColumns.map((col: any, idx: number) => <td key={`header-${idx}`} className={classForColumn(col, idx)}>{isZ3 ? (col.label || "") : col.group === "wan" ? (col.label || "Internet") : (col.label || "")}</td>)}
            </tr>
            <tr>
              <td className={`${managementCellClass} port-number`} />
              {effectiveColumns.map((col: any, idx: number) => {
                if (isZ3) {
                  const num = parsePortNumber(col.top?.number ?? col.top?.displayNumber);
                  return <td key={`top-n-${idx}`} className={`${classForColumn(col, idx)} port-number`}><span className="port-number-value">{num}{num === 5 && isPoEPort(col.top, model) && <span className="PoEInline" title="PoE" style={{ marginLeft: "4px" }}>PoE</span>}</span></td>;
                }
                const topLabel = formatVisiblePortNumber(col.top, col.group);
                return <td key={`top-n-${idx}`} className={`${classForColumn(col, idx)} port-number`}>{topLabel ? <span className="port-number-value">{topLabel}{(() => { const n = parsePortNumber(col.top?.number ?? col.top?.displayNumber); if (n !== 5 || !isPoEPort(col.top, model)) return null; const norm = normalizeReachability(col.top?.statusNormalized || col.top?.status); return <span className={`PoEInline ${norm === "connected" ? "active" : "inactive"}`} title={norm === "connected" ? "PoE — active" : "PoE — inactive"}>PoE</span>; })()}</span> : col.group === "wan" ? (col.label || "Internet") : ""}</td>;
              })}
            </tr>
            <tr>
              <td className={`${managementCellClass} label-cell`}>{!isZ3 && management.length ? "Management" : ""}</td>
              {effectiveColumns.map((col: any, idx: number) => <td key={`top-icon-${idx}`} className={classForColumn(col, idx)}><div className="port-content"><NodePort port={col.top} rotated={false} /></div></td>)}
            </tr>
            {!isZ3 && (
              <tr>
                <td className={managementCellClass}>{management.length > 0 && <div className="ManagementPorts">{management.map((p: any) => <NodePort key={`mgmt-${p.number || p.name || p.id}`} port={p} rotated={false} />)}</div>}</td>
                {effectiveColumns.map((col: any, idx: number) => <td key={`bottom-icon-${idx}`} className={classForColumn(col, idx)}><div className="port-content"><NodePort port={col.bottom} rotated={Boolean(col.bottom)} /></div></td>)}
              </tr>
            )}
            {!isZ3 && (
              <tr>
                <td className={managementCellClass}>{management.length > 0 && <div className="ManagementNumbers">{management.map((p: any) => p.displayNumber ?? p.number).filter(Boolean).map((v: any) => <span key={`mgmt-n-${v}`}>{v}</span>)}</div>}</td>
                {effectiveColumns.map((col: any, idx: number) => <td key={`bottom-n-${idx}`} className={`${classForColumn(col, idx)} port-number`}><span className="port-number-value">{formatVisiblePortNumber(col.bottom, col.group)}{(() => { const n = parsePortNumber(col.bottom?.number ?? col.bottom?.displayNumber); if (n !== 5 || !isPoEPort(col.bottom, model)) return null; const norm = normalizeReachability(col.bottom?.statusNormalized || col.bottom?.status); return <span className={`PoEInline ${norm === "connected" ? "active" : "inactive"}`} title={norm === "connected" ? "PoE — active" : "PoE — inactive"}>PoE</span>; })()}</span></td>)}
              </tr>
            )}
          </tbody>
        </table>
      </span>
    </div>
  );
}

export { NodePort };
