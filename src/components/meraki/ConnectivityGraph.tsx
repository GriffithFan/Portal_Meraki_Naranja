"use client";
import { useState, useMemo } from "react";
import Tooltip from "./Tooltip";
import "./ConnectivityGraph.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const normalizeStatus = (status: any): string => {
  if (!status) return "unknown";
  const normalized = status.toString().toLowerCase();
  if (/connect|online|up|active/.test(normalized)) return "connected";
  if (/disconnect|offline|down|failed/.test(normalized)) return "disconnected";
  if (/degrad|warn|alert/.test(normalized)) return "degraded";
  return "unknown";
};

interface ConnectivityGraphProps {
  uplinkHistory?: any[];
  showFilters?: boolean;
}

const TIME_FILTERS = [
  { label: "1h", hours: 1 },
  { label: "2h", hours: 2 },
  { label: "6h", hours: 6 },
  { label: "12h", hours: 12 },
  { label: "24h", hours: 24 },
  { label: "48h", hours: 48 },
];

export default function ConnectivityGraph({ uplinkHistory = [], showFilters = true }: ConnectivityGraphProps) {
  const [timeFilter, setTimeFilter] = useState(1);

  const processedData = useMemo(() => {
    if (!Array.isArray(uplinkHistory) || uplinkHistory.length === 0) return { segments: [], stats: null, totalDuration: 0 };

    const allPoints: any[] = [];
    uplinkHistory.forEach((series) => {
      const points = Array.isArray(series?.points) ? series.points : [];
      points.forEach((point: any) => {
        const timestamp = new Date(point.ts || point.timestamp || point.time).getTime();
        if (!isNaN(timestamp)) {
          allPoints.push({
            time: timestamp,
            status: normalizeStatus(point.statusNormalized || point.status),
            interface: series.interface,
            latency: point.latency,
            loss: point.lossPercent,
            throughput: point.totalKbps || point.usage,
          });
        }
      });
    });

    if (allPoints.length === 0) return { segments: [], stats: null, totalDuration: 0 };
    allPoints.sort((a, b) => a.time - b.time);
    const now = Date.now();
    const cutoffTime = now - timeFilter * 3600 * 1000;
    const filteredPoints = allPoints.filter((p) => p.time >= cutoffTime);
    if (filteredPoints.length < 2) return { segments: [], stats: null, totalDuration: 0 };

    const segments: any[] = [];
    const microOutages: any[] = [];
    let currentOutage: any = null;

    for (let i = 0; i < filteredPoints.length - 1; i++) {
      const current = filteredPoints[i];
      const next = filteredPoints[i + 1];
      const duration = next.time - current.time;
      if (duration <= 0) continue;
      segments.push({ status: current.status, duration, startTime: current.time, endTime: next.time, interface: current.interface, latency: current.latency, loss: current.loss });

      if (current.status === "disconnected" || (current.loss != null && current.loss > 10)) {
        if (currentOutage === null) { currentOutage = { start: current.time, end: next.time, duration, interface: current.interface }; }
        else { currentOutage.end = next.time; currentOutage.duration += duration; }
      } else if (currentOutage !== null) { microOutages.push(currentOutage); currentOutage = null; }
    }
    if (currentOutage !== null) microOutages.push(currentOutage);

    const totalDuration = filteredPoints[filteredPoints.length - 1].time - filteredPoints[0].time;
    const disconnectedTime = segments.filter((s) => s.status === "disconnected").reduce((acc, s) => acc + s.duration, 0);
    const latArr = filteredPoints.filter((p) => p.latency != null && !isNaN(p.latency));
    const avgLatency = latArr.length ? latArr.reduce((acc, p) => acc + p.latency, 0) / latArr.length : null;
    const lossArr = filteredPoints.filter((p) => p.loss != null && !isNaN(p.loss));
    const avgLoss = lossArr.length ? lossArr.reduce((acc, p) => acc + p.loss, 0) / lossArr.length : null;

    return {
      segments,
      stats: { totalDuration, disconnectedTime, uptime: ((totalDuration - disconnectedTime) / totalDuration) * 100, microOutagesCount: microOutages.length, avgLatency, avgLoss, microOutages },
      totalDuration,
    };
  }, [uplinkHistory, timeFilter]);

  const { segments, stats, totalDuration } = processedData;

  if (!segments.length) return <div className="connectivity-graph-container"><div className="connectivity-graph-empty">Sin datos de conectividad disponibles</div></div>;

  const getStatusColor = (status: string) => { if (status === "connected") return "#22c55e"; if (status === "disconnected") return "#ef4444"; if (status === "degraded" || status === "warning") return "#f59e0b"; return "#94a3b8"; };
  const formatDuration = (ms: number) => { const s = Math.floor(ms / 1000); if (s < 60) return `${s}s`; const m = Math.floor(s / 60); if (m < 60) return `${m}m`; const h = Math.floor(m / 60); return `${h}h ${m % 60}m`; };
  const formatTimestamp = (ts: number) => new Date(ts).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });

  return (
    <div className="connectivity-graph-container">
      {showFilters && (
        <div className="connectivity-graph-filters">
          {TIME_FILTERS.map((filter) => (
            <button key={filter.hours} className={`filter-btn ${timeFilter === filter.hours ? "active" : ""}`} onClick={() => setTimeFilter(filter.hours)}>
              {filter.label}
            </button>
          ))}
        </div>
      )}
      <div className="connectivity-graph">
        <div className="connectivity-timeline">
          {segments.map((segment, idx) => {
            const widthPercent = (segment.duration / totalDuration) * 100;
            const tooltipContent = (
              <div>
                <div className="tooltip-title">{segment.interface?.toUpperCase() || "Uplink"}</div>
                <div className="tooltip-row"><span className="tooltip-label">Estado</span><span className={`tooltip-badge ${segment.status === "connected" ? "success" : segment.status === "warning" ? "warning" : "error"}`}>{segment.status}</span></div>
                <div className="tooltip-row"><span className="tooltip-label">Duración</span><span className="tooltip-value">{formatDuration(segment.duration)}</span></div>
                <div className="tooltip-row"><span className="tooltip-label">Inicio</span><span className="tooltip-value">{formatTimestamp(segment.startTime)}</span></div>
                {segment.latency != null && <div className="tooltip-row"><span className="tooltip-label">Latencia</span><span className="tooltip-value">{segment.latency.toFixed(1)} ms</span></div>}
                {segment.loss != null && <div className="tooltip-row"><span className="tooltip-label">Pérdida</span><span className="tooltip-value">{segment.loss.toFixed(1)}%</span></div>}
              </div>
            );
            return (
              <Tooltip key={idx} content={tooltipContent} position="top">
                <div className={`timeline-segment ${segment.status}`} style={{ width: `${widthPercent}%`, backgroundColor: getStatusColor(segment.status) }} />
              </Tooltip>
            );
          })}
        </div>
      </div>
      {stats && (
        <div className="connectivity-stats">
          <div className="stat-item"><span className="stat-label">Uptime</span><span className="stat-value">{stats.uptime.toFixed(2)}%</span></div>
          <div className="stat-item"><span className="stat-label">Microcortes</span><span className="stat-value highlight">{stats.microOutagesCount}</span></div>
          {stats.avgLatency != null && <div className="stat-item"><span className="stat-label">Latencia media</span><span className="stat-value">{stats.avgLatency.toFixed(1)} ms</span></div>}
          {stats.avgLoss != null && stats.avgLoss > 0 && <div className="stat-item"><span className="stat-label">Pérdida media</span><span className="stat-value">{stats.avgLoss.toFixed(2)}%</span></div>}
          <div className="stat-item"><span className="stat-label">Tiempo caído</span><span className="stat-value">{formatDuration(stats.disconnectedTime)}</span></div>
        </div>
      )}
      {(stats?.microOutages?.length ?? 0) > 0 && (
        <div className="micro-outages-list">
          <h4>Microcortes detectados:</h4>
          <div className="outages-grid">
            {stats!.microOutages!.map((outage: any, idx: number) => (
              <div key={idx} className="outage-item">
                <span className="outage-time">{formatTimestamp(outage.start)}</span>
                <span className="outage-duration">{formatDuration(outage.duration)}</span>
                <span className="outage-interface">{outage.interface}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
