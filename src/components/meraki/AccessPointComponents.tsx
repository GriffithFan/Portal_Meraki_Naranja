"use client";
import { normalizeReachability, getStatusColor } from "@/utils/networkUtils";
import { formatDuration } from "@/utils/formatters";
import Tooltip from "./Tooltip";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Timeline de conectividad (UNTOUCHABLE)
 */
export const ConnectivityTimeline = ({ series }: { series: any }) => {
  const points: any[] = Array.isArray(series?.points) ? series.points : [];
  if (points.length < 2) return null;

  const parsed = points
    .map((p) => {
      const ts = new Date(p.ts || p.timestamp || p.time).getTime();
      if (isNaN(ts)) return null;
      return { time: ts, status: normalizeReachability(p.statusNormalized || p.status || p.reachability) };
    })
    .filter(Boolean) as { time: number; status: string }[];
  parsed.sort((a, b) => a.time - b.time);
  if (parsed.length < 2) return null;

  const total = parsed[parsed.length - 1].time - parsed[0].time;
  if (total <= 0) return null;

  const segments: { status: string; duration: number }[] = [];
  for (let i = 0; i < parsed.length - 1; i++) {
    const d = parsed[i + 1].time - parsed[i].time;
    if (d > 0) segments.push({ status: parsed[i].status, duration: d });
  }
  if (!segments.length) return null;

  const sc = (s: string) => s === "connected" ? "#22c55e" : s === "disabled" ? "#94a3b8" : "#f97316";

  return (
    <div style={{ display: "flex", borderRadius: 999, overflow: "hidden", border: "1px solid #cbd5e1", height: 12, width: "100%" }}>
      {segments.map((seg, i) => <div key={`${seg.status}-${i}`} style={{ flex: seg.duration, background: sc(seg.status) }} />)}
    </div>
  );
};

/**
 * Sparkline de calidad de señal (UNTOUCHABLE)
 */
export const SignalQualitySparkline = ({ samples = [], threshold = 25 }: { samples: any[]; threshold?: number }) => {
  const pts = samples.filter((s) => s?.signalQuality != null);
  if (pts.length < 2) return null;

  const W = 260, H = 70;
  const qs = pts.map((s) => Number(s.signalQuality));
  const mx = Math.max(...qs, threshold + 5, 1);
  const mn = Math.min(...qs, threshold - 10);
  const rng = Math.max(mx - mn, 10);

  const toP = (s: any, i: number) => {
    const x = (i / (pts.length - 1 || 1)) * W;
    const y = H - ((Number(s.signalQuality) - mn) / rng) * H;
    return `${i === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
  };

  const line = pts.map(toP).join(" ");
  const thY = H - ((threshold - mn) / rng) * H;
  const lastN = (Number(pts[pts.length - 1].signalQuality) - mn) / rng;
  const lastY = H - lastN * H;

  return (
    <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="signalGradient" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#22c55e" stopOpacity="0.35" />
          <stop offset="100%" stopColor="#ef4444" stopOpacity="0.15" />
        </linearGradient>
      </defs>
      <path d={`${line} L ${W} ${H} L 0 ${H} Z`} fill="url(#signalGradient)" opacity="0.35" />
      <path d={line} fill="none" stroke="#22c55e" strokeWidth="2" />
      <line x1="0" x2={W} y1={thY} y2={thY} stroke="#f97316" strokeDasharray="6 4" strokeWidth="1" />
      <circle cx={W} cy={lastY} r={3} fill="#0f172a" stroke="#fff" strokeWidth="1" />
    </svg>
  );
};

/**
 * Barra de conectividad tipo Meraki Dashboard (UNTOUCHABLE)
 */
export const ConnectivityBar = ({ ap, device }: { ap?: any; device?: any }) => {
  const target = device || ap;
  const wireless = target?.wireless || {};
  const history: any[] = Array.isArray(wireless.history) ? wireless.history : [];
  const statusNormalized = normalizeReachability(target?.status);
  const lastReportedAt = target?.lastReportedAt || null;

  const formatLastSeen = (ts: string | null) => {
    if (!ts) return "Nunca conectado";
    try {
      const d = new Date(ts);
      const diff = Date.now() - d.getTime();
      const mins = Math.floor(diff / 60000);
      const hrs = Math.floor(diff / 3600000);
      const days = Math.floor(diff / 86400000);
      if (mins < 1) return "Hace menos de 1 minuto";
      if (mins < 60) return `Hace ${mins} minuto${mins > 1 ? "s" : ""}`;
      if (hrs < 24) return `Hace ${hrs} hora${hrs > 1 ? "s" : ""}`;
      if (days < 7) return `Hace ${days} día${days > 1 ? "s" : ""}`;
      return d.toLocaleString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
    } catch { return ts; }
  };

  if (!history.length) {
    const c = statusNormalized === "connected" ? "#45991f" : statusNormalized === "warning" ? "#f59e0b" : "#cbd5e1";
    const t = statusNormalized === "connected" ? "Conectado" : statusNormalized === "warning" ? "Conectado con advertencias" : `Sin datos recientes${lastReportedAt ? "\nÚltima conexión: " + formatLastSeen(lastReportedAt) : ""}`;
    return (
      <div style={{ display: "flex", height: "10px", borderRadius: "3px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
        <div style={{ width: "100%", background: c, transition: "all .3s ease", cursor: "help" }} title={t} />
      </div>
    );
  }

  const EXCELLENT = 60, GOOD = 40, FAIR = 25, POOR = 15;

  const segs = history.map((sample) => {
    const q = sample.signalQuality ?? -1;
    const failures = sample.failures || 0;
    const tl = sample.ts || sample.timestamp ? new Date(sample.ts || sample.timestamp).toLocaleString("es-AR", { hour: "2-digit", minute: "2-digit" }) : "";
    if (failures > 0) return { color: "#ef4444", label: `Interferencia${tl ? " (" + tl + ")" : ""}\nFallos: ${failures}${q >= 0 ? " - Calidad: " + q + "%" : ""}` };
    if (q <= 0) return { color: "#ef4444", label: q === 0 ? `Desconectado${tl ? " (" + tl + ")" : ""}` : `Sin señal${tl ? " (" + tl + ")" : ""}` };
    if (q < POOR) return { color: "#dc2626", label: `Señal muy débil${tl ? " (" + tl + ")" : ""}\nCalidad: ${q}%` };
    if (q < FAIR) return { color: "#ea580c", label: `Señal débil${tl ? " (" + tl + ")" : ""}\nCalidad: ${q}%` };
    if (q < GOOD) return { color: "#f59e0b", label: `Señal regular${tl ? " (" + tl + ")" : ""}\nCalidad: ${q}%` };
    if (q < EXCELLENT) return { color: "#65a30d", label: `Señal buena${tl ? " (" + tl + ")" : ""}\nCalidad: ${q}%` };
    return { color: "#16a34a", label: `Señal excelente${tl ? " (" + tl + ")" : ""}\nCalidad: ${q}%` };
  });

  return (
    <div style={{ display: "flex", height: "10px", borderRadius: "3px", overflow: "hidden", border: "1px solid #cbd5e1" }}>
      {segs.map((s, i) => <div key={i} style={{ flex: 1, background: s.color, transition: "all .3s ease", cursor: "help" }} title={s.label} />)}
    </div>
  );
};

/**
 * Tarjeta de Access Point con métricas wireless (UNTOUCHABLE)
 */
export const AccessPointCard = ({ ap, signalThreshold = 25 }: { ap: any; signalThreshold?: number }) => {
  const statusNormalized = normalizeReachability(ap.status);
  const statusColor = getStatusColor(ap.status);
  const wireless = ap.wireless || {};
  const history: any[] = Array.isArray(wireless.history) ? wireless.history : [];
  const signalSummary = wireless.signalSummary || {};
  const microDrops = signalSummary.totalFailures || 0;
  const microDuration = signalSummary.totalFailureDuration || 0;

  const apTooltip = ap.tooltipInfo ? (
    <div>
      <div className="tooltip-title">{ap.tooltipInfo.name}</div>
      {ap.tooltipInfo.model && <div className="tooltip-row"><span className="tooltip-label">Modelo</span><span className="tooltip-value">{ap.tooltipInfo.model}</span></div>}
      {ap.tooltipInfo.serial && <div className="tooltip-row"><span className="tooltip-label">Serial</span><span className="tooltip-value">{ap.tooltipInfo.serial}</span></div>}
      {ap.tooltipInfo.mac && <div className="tooltip-row"><span className="tooltip-label">MAC</span><span className="tooltip-value">{ap.tooltipInfo.mac}</span></div>}
      {ap.tooltipInfo.firmware && <div className="tooltip-row"><span className="tooltip-label">Firmware</span><span className="tooltip-value">{ap.tooltipInfo.firmware}</span></div>}
      {ap.tooltipInfo.lanIp && <div className="tooltip-row"><span className="tooltip-label">LAN IP</span><span className="tooltip-value">{ap.tooltipInfo.lanIp}</span></div>}
      {ap.tooltipInfo.connectedTo && ap.tooltipInfo.connectedTo !== "-" && <div className="tooltip-row"><span className="tooltip-label">Conectado a</span><span className="tooltip-value">{ap.tooltipInfo.connectedTo}</span></div>}
    </div>
  ) : null;

  return (
    <div className="modern-card">
      <div className="modern-card-header">
        <div>
          <Tooltip content={apTooltip || "Access Point"} position="auto">
            <h3 className="modern-card-title" style={{ cursor: "pointer" }}>{ap.name || ap.serial}</h3>
          </Tooltip>
          <p className="modern-card-subtitle">{ap.model} · {ap.serial}</p>
          {ap.lanIp && <p className="modern-card-subtitle" style={{ marginTop: "2px" }}>IP: {ap.lanIp}</p>}
        </div>
        <span className={`status-badge ${statusNormalized}`} style={{ background: statusNormalized === "connected" ? "#d1fae5" : statusNormalized === "warning" ? "#fef9c3" : "#fee2e2", color: statusColor }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: statusColor }} />
          {statusNormalized === "warning" ? "warning" : ap.status}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginBottom: "18px", padding: "14px", background: "#f1f5f9", borderRadius: "10px" }}>
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>Microcortes</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: microDrops > 0 ? "#ef4444" : "#22c55e", marginTop: "2px" }}>{microDrops}</div>
        </div>
        <div>
          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "500", textTransform: "uppercase", letterSpacing: "0.5px" }}>Duración</div>
          <div style={{ fontSize: "20px", fontWeight: "700", color: "#1e293b", marginTop: "2px" }}>{formatDuration(microDuration)}</div>
        </div>
      </div>

      <div style={{ marginBottom: "18px" }}>
        <div style={{ fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Conectividad 24h</div>
        <ConnectivityBar ap={ap} />
      </div>

      {history.length > 1 && (
        <div>
          <div style={{ fontSize: "12px", fontWeight: "600", color: "#475569", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.5px" }}>Calidad de Señal</div>
          <SignalQualitySparkline samples={history} threshold={signalThreshold} />
        </div>
      )}
    </div>
  );
};
