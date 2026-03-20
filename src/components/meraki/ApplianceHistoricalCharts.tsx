"use client";
import { useState, useEffect, useRef } from "react";
import { useTheme } from "@/contexts/ThemeContext";

/* eslint-disable @typescript-eslint/no-explicit-any */

const timespanOptions = [
  { label: "for the last 2 hours", value: 7200 },
  { label: "for the last day", value: 86400 },
  { label: "for the last week", value: 604800 },
  { label: "for the last month", value: 2592000 },
];

interface ApplianceHistoricalChartsProps {
  networkId: string;
}

export default function ApplianceHistoricalCharts({ networkId }: ApplianceHistoricalChartsProps) {
  const { theme } = useTheme();
  const dk = theme === "dark";
  const c = {
    bg: dk ? "#1a2332" : "white",
    border: dk ? "#2a3a4e" : "#e5e7eb",
    title: dk ? "#f1f5f9" : "#111827",
    subtitle: dk ? "#94a3b8" : "#4b5563",
    label: dk ? "#64748b" : "#6b7280",
    labelMuted: dk ? "#475569" : "#9ca3af",
    text: dk ? "#e2e8f0" : "#374151",
    emptyBar: dk ? "#334155" : "#e5e7eb",
    grid: dk ? "#1e293b" : "#e5e7eb",
    btnBg: dk ? "#1a2332" : "white",
    btnBorder: dk ? "#2a3a4e" : "#d1d5db",
    btnHover: dk ? "#263549" : "#f3f4f6",
    tipBg: dk ? "rgba(120,53,15,.35)" : "#fffbeb",
    tipBorder: dk ? "rgba(251,191,36,.35)" : "#fbbf24",
    tipText: dk ? "#fcd34d" : "#78350f",
    noData: dk ? "#94a3b8" : "#94a3b8",
    shadow: dk ? "0 4px 6px -1px rgba(0,0,0,0.3)" : "0 4px 6px -1px rgba(0,0,0,0.1)",
  };
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>({ connectivity: [], uplinkUsage: [] });
  const [timespan, setTimespan] = useState(86400);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [tooltip, setTooltip] = useState({ visible: false, x: 0, y: 0, content: "" });
  const svgRef = useRef<SVGSVGElement>(null);

  const getTimespanLabel = () => timespanOptions.find((o) => o.value === timespan)?.label || "for the last day";

  useEffect(() => {
    if (!networkId) return;
    const fetchHistorical = async () => {
      setLoading(true);
      try {
        let resolution: number;
        if (timespan <= 7200) resolution = 60;
        else if (timespan <= 86400) resolution = 300;
        else if (timespan <= 604800) resolution = 600;
        else resolution = 3600;
        const response = await fetch(`/api/meraki/networks/${networkId}/appliance/historical?timespan=${timespan}&resolution=${resolution}`, { credentials: "include" });
        if (response.ok) {
          const result = await response.json();
          if (result.connectivity) result.connectivity = result.connectivity.map((p: any) => ({ ...p, ts: p.ts || p.startTime || p.startTs || p.endTime }));
          if (result.uplinkUsage) result.uplinkUsage = result.uplinkUsage.map((p: any) => ({ ...p, ts: p.ts || p.startTime || p.endTime }));
          setData(result);
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
    };
    fetchHistorical();
  }, [networkId, timespan]);

  const formatTimestamp = (ts: any) => {
    if (!ts) return "";
    let date: Date;
    if (typeof ts === "string") date = new Date(ts);
    else if (typeof ts === "number") date = ts > 10000000000 ? new Date(ts) : new Date(ts * 1000);
    else return "";
    if (isNaN(date.getTime())) return "";
    if (timespan <= 86400) return date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
    return date.toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
  };

  const renderConnectivityChart = () => {
    if (!data.connectivity || data.connectivity.length === 0) {
      return (
        <div style={{ position: "relative", marginTop: "4px" }}>
          <svg width="100%" height="8" style={{ display: "block" }}><rect x={0} y={0} width="100%" height="8" fill={c.emptyBar} rx="1" /></svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: c.labelMuted, marginTop: "6px", paddingLeft: "2px", paddingRight: "2px" }}>
            {Array.from({ length: 6 }, (_, i) => <span key={i} style={{ textAlign: i === 0 ? "left" : i === 5 ? "right" : "center" }}>--</span>)}
          </div>
        </div>
      );
    }

    const points = data.connectivity;
    const chartHeight = 8;
    const pointsWithState = points.map((p: any) => {
      const loss = p?.lossPercent != null ? Number(p.lossPercent) : p?.loss != null ? Number(p.loss) : null;
      const latency = p?.latencyMs != null ? Number(p.latencyMs) : p?.latency != null ? Number(p.latency) : null;
      const hasLatency = latency !== null && Number.isFinite(latency) && latency >= 0;
      const hasLoss = loss !== null && Number.isFinite(loss) && loss >= 0;
      let state = "offline";
      if (!hasLatency && !hasLoss) state = "offline";
      else if (hasLoss && loss! >= 90) state = "no_signal";
      else if (!hasLatency && hasLoss && loss! >= 60) state = "no_signal";
      else state = "connected";
      return { ...p, lossPercent: loss, latencyMs: latency, state };
    });

    const handleMouseMove = (e: React.MouseEvent) => {
      if (!svgRef.current) return;
      const rect = svgRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const relativeX = x / rect.width;
      const pointIndex = Math.floor(relativeX * pointsWithState.length);
      const point = pointsWithState[pointIndex];
      if (point) {
        const timestamp = point.ts || point.startTs || point.timestamp || point.time;
        const date = timestamp ? new Date(timestamp) : null;
        const timeStr = date ? date.toLocaleString("es-ES", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "Unknown time";
        let statusText = "";
        if (point.state === "connected") statusText = `Connected gateway (${timeStr})`;
        else if (point.state === "no_signal") statusText = `Poor connection (${timeStr})`;
        else statusText = `No connectivity (starting ${timeStr})`;
        setTooltip({ visible: true, x: e.clientX, y: e.clientY - 40, content: statusText });
      }
    };

    return (
      <div style={{ position: "relative", marginTop: "4px" }}>
        <svg ref={svgRef} width="100%" height={chartHeight} style={{ display: "block", borderRadius: "1px", cursor: "pointer" }} preserveAspectRatio="none" onMouseMove={handleMouseMove} onMouseLeave={() => setTooltip({ visible: false, x: 0, y: 0, content: "" })}>
          {pointsWithState.map((point: any, idx: number) => {
            const count = pointsWithState.length || 1;
            const xPercent = (idx / count) * 100;
            const widthPercent = 100 / count;
            const fillColor = point.state === "offline" ? "#d1d5db" : point.state === "no_signal" ? "#ef4444" : "#22c55e";
            return <rect key={idx} x={`${xPercent}%`} y={0} width={`${widthPercent}%`} height="100%" fill={fillColor} shapeRendering="crispEdges" />;
          })}
        </svg>
        {tooltip.visible && <div style={{ position: "fixed", left: tooltip.x, top: tooltip.y, transform: "translateX(-50%)", background: c.tipBg, border: `1px solid ${c.tipBorder}`, borderRadius: "4px", padding: "6px 10px", fontSize: "12px", color: c.tipText, whiteSpace: "nowrap", pointerEvents: "none", zIndex: 9999, boxShadow: c.shadow }}>{tooltip.content}</div>}
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: "11px", color: c.label, marginTop: "6px", paddingLeft: "2px", paddingRight: "2px" }}>
          {Array.from({ length: 6 }, (_, i) => { const idx = Math.floor((points.length - 1) * (i * 20) / 100); const point = points[idx]; if (!point) return <span key={i}>--</span>; return <span key={i} style={{ textAlign: i === 0 ? "left" : i === 5 ? "right" : "center" }}>{formatTimestamp(point.ts) || "--"}</span>; })}
        </div>
      </div>
    );
  };

  const renderUplinkUsageChart = () => {
    if (!data.uplinkUsage || data.uplinkUsage.length === 0) return <div style={{ padding: "40px 20px", textAlign: "center", color: c.noData, fontSize: "14px" }}>Sin datos de uso de uplinks disponibles</div>;

    const chartHeight = 180;
    const chartMarginTop = 10;
    const chartMarginBottom = 10;
    const actualChartHeight = chartHeight - chartMarginTop - chartMarginBottom;
    const points = data.uplinkUsage;
    // Use same resolution that was sent to the backend
    let intervalSeconds: number;
    if (timespan <= 7200) intervalSeconds = 60;
    else if (timespan <= 86400) intervalSeconds = 300;
    else if (timespan <= 604800) intervalSeconds = 600;
    else intervalSeconds = 3600;

    const allMbpsValues = points.flatMap((p: any) => { const interfaces = Array.isArray(p.byInterface) ? p.byInterface : Object.values(p.byInterface || {}); return interfaces.map((i: any) => (i.received || 0) / intervalSeconds / 125000); });
    const maxReceivedMbps = Math.max(...allMbpsValues, 0.1);
    const getSmartScale = (maxVal: number) => { if (maxVal <= 1) return { max: 1.5, step: 0.5, decimals: 1 }; if (maxVal <= 3) return { max: 4.5, step: 1.5, decimals: 1 }; if (maxVal <= 6) return { max: 6, step: 1.5, decimals: 1 }; if (maxVal <= 10) return { max: 12, step: 3, decimals: 0 }; if (maxVal <= 20) return { max: 20, step: 4, decimals: 0 }; if (maxVal <= 50) return { max: 50, step: 10, decimals: 0 }; if (maxVal <= 100) return { max: 100, step: 20, decimals: 0 }; return { max: Math.ceil(maxVal / 50) * 50, step: Math.ceil(maxVal / 50) * 10, decimals: 0 }; };
    const scale = getSmartScale(maxReceivedMbps);
    const maxScale = scale.max;
    const gridStep = scale.step;
    const gridLines = Math.round(maxScale / gridStep);
    const formatMbps = (mbps: number) => scale.decimals > 0 ? `${mbps.toFixed(1)} Mb/s` : `${Math.round(mbps)} Mb/s`;

    const wanInterfaces: Record<string, any[]> = {};
    points.forEach((p: any) => { const interfaces = Array.isArray(p.byInterface) ? p.byInterface : []; interfaces.forEach((ifaceData: any) => { const ifaceName = ifaceData.interface || "unknown"; if (!wanInterfaces[ifaceName]) wanInterfaces[ifaceName] = []; wanInterfaces[ifaceName].push({ ts: p.ts, received: (ifaceData.received || 0) / intervalSeconds / 125000 }); }); });
    const colors: Record<string, string> = { wan1: "#5b9bd5", wan2: "#41b6c4", cellular: "#ffc107" };

    const formatAxisTime = (ts: any) => { if (!ts) return ""; let date: Date; if (typeof ts === "string") date = new Date(ts); else if (typeof ts === "number") date = ts > 10000000000 ? new Date(ts) : new Date(ts * 1000); else return ""; if (isNaN(date.getTime())) return ""; const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]; if (timespan > 86400) return `${months[date.getMonth()]} ${date.getDate()} ${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`; return `${date.getHours().toString().padStart(2, "0")}:${date.getMinutes().toString().padStart(2, "0")}`; };

    return (
      <div style={{ position: "relative", marginTop: "16px" }}>
        <div style={{ display: "flex", gap: "16px", marginBottom: "12px", fontSize: "12px", justifyContent: "flex-end", alignItems: "center" }}>
          {Object.keys(wanInterfaces).map((iface) => (
            <div key={iface} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <div style={{ width: "12px", height: "12px", background: colors[iface.toLowerCase()] || "#64748b", borderRadius: "2px" }} />
              <span style={{ color: c.text, fontWeight: "500", fontSize: "12px" }}>{iface.toUpperCase().replace("WAN", "WAN ")}</span>
            </div>
          ))}
        </div>
        <div style={{ position: "relative", marginLeft: "50px" }}>
          <div style={{ position: "absolute", left: "-50px", top: chartMarginTop, height: actualChartHeight, display: "flex", flexDirection: "column", justifyContent: "space-between", fontSize: "11px", color: c.label, textAlign: "right", width: "45px" }}>
            {Array.from({ length: gridLines + 1 }).map((_, i) => <span key={i} style={{ transform: "translateY(-50%)" }}>{formatMbps(maxScale - i * gridStep)}</span>)}
          </div>
          <svg width="100%" height={chartHeight} viewBox={`0 0 100 ${chartHeight}`} preserveAspectRatio="none" style={{ display: "block" }}>
            <defs>{Object.keys(wanInterfaces).map((iface) => <linearGradient key={iface} id={`gradient-${iface}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={colors[iface.toLowerCase()] || "#64748b"} stopOpacity="0.5" /><stop offset="100%" stopColor={colors[iface.toLowerCase()] || "#64748b"} stopOpacity="0.1" /></linearGradient>)}</defs>
            {Array.from({ length: gridLines + 1 }).map((_, i) => { const y = chartMarginTop + (i * actualChartHeight) / gridLines; return <line key={i} x1="0" y1={y} x2="100" y2={y} stroke={c.grid} strokeWidth="0.3" vectorEffect="non-scaling-stroke" />; })}
            {Object.entries(wanInterfaces).map(([iface, ifacePoints]) => {
              const pathData = ifacePoints.map((point, idx) => { const x = (idx / Math.max(ifacePoints.length - 1, 1)) * 100; const yValue = chartMarginTop + actualChartHeight - (point.received / maxScale) * actualChartHeight; return `${idx === 0 ? "M" : "L"} ${x} ${Math.max(chartMarginTop, Math.min(yValue, chartHeight - chartMarginBottom))}`; }).join(" ");
              const fillPath = `${pathData} L 100 ${chartHeight - chartMarginBottom} L 0 ${chartHeight - chartMarginBottom} Z`;
              return <g key={iface}><path d={fillPath} fill={`url(#gradient-${iface})`} /><path d={pathData} fill="none" stroke={colors[iface.toLowerCase()] || "#64748b"} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" /></g>;
            })}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: "10px", color: c.label, marginTop: "6px", overflow: "hidden" }}>
            {(() => { const numLabels = timespan <= 86400 ? 7 : timespan <= 604800 ? 14 : 10; return Array.from({ length: numLabels }, (_, i) => { const idx = Math.floor((points.length - 1) * (i / (numLabels - 1)) * 100 / 100); const point = points[idx]; return <span key={i} style={{ flex: 1, textAlign: "center", whiteSpace: "nowrap" }}>{point ? formatAxisTime(point.ts) : ""}</span>; }); })()}
          </div>
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ padding: "40px", textAlign: "center" }}><div className="spinner" /><div style={{ marginTop: "12px", color: c.label }}>Cargando datos historicos...</div></div>;

  return (
    <div style={{ marginTop: "24px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <h3 style={{ margin: 0, fontSize: "18px", fontWeight: "400", color: c.title, letterSpacing: "-0.01em" }}>Historical device data</h3>
        <div style={{ position: "relative" }}>
          <button onClick={() => setDropdownOpen(!dropdownOpen)} style={{ padding: "6px 32px 6px 12px", borderRadius: "4px", border: `1px solid ${c.btnBorder}`, fontSize: "13px", color: c.text, background: c.btnBg, cursor: "pointer", fontFamily: "inherit", display: "flex", alignItems: "center", gap: "4px", position: "relative" }}>
            {getTimespanLabel()}<span style={{ position: "absolute", right: "10px", fontSize: "10px", color: c.label }}>▼</span>
          </button>
          {dropdownOpen && (
            <>
              <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 999 }} onClick={() => setDropdownOpen(false)} />
              <div style={{ position: "absolute", top: "100%", right: 0, marginTop: "4px", background: c.bg, border: `1px solid ${c.btnBorder}`, borderRadius: "4px", boxShadow: c.shadow, minWidth: "180px", zIndex: 1000, overflow: "hidden" }}>
                {timespanOptions.map((option) => <div key={option.value} onClick={() => { setTimespan(option.value); setDropdownOpen(false); }} style={{ padding: "8px 12px", fontSize: "13px", color: c.text, cursor: "pointer", background: timespan === option.value ? c.btnHover : c.bg, fontWeight: timespan === option.value ? "500" : "400" }}>{option.label}</div>)}
              </div>
            </>
          )}
        </div>
      </div>
      <div style={{ background: c.bg, borderRadius: "6px", padding: "16px 20px", marginBottom: "16px", border: `1px solid ${c.border}` }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: c.subtitle }}>Connectivity</h4>
        {renderConnectivityChart()}
      </div>
      <div style={{ background: c.bg, borderRadius: "6px", padding: "16px 20px 16px 60px", border: `1px solid ${c.border}` }}>
        <h4 style={{ margin: "0 0 12px 0", fontSize: "13px", fontWeight: "600", color: c.subtitle, marginLeft: "-40px" }}>Client usage</h4>
        {renderUplinkUsageChart()}
      </div>
    </div>
  );
}
