"use client";
import Tooltip from "./Tooltip";
import { normalizeReachability } from "@/utils/networkUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * Ícono de estado fiel al Dashboard de Cisco Meraki, compartido por APs y switches.
 * - Forma: círculo lleno = "gateway" (dispositivo con IP de gestión por uplink
 *   cableado); círculo punteado = "repeater" (AP mesh, sin IP propia). Los switches
 *   siempre tienen IP, así que se ven como círculo lleno.
 * - Color por estado: online=verde, alerting=ámbar, offline=rojo, dormant=gris.
 * - Glifo: ✓ online, ✕ offline, ! alerting.
 * Tooltips replican los de Meraki: "Online repeater", "Alerting repeater", etc.
 */
export function DeviceStatusIcon({ device, size = 16.5 }: { device: any; size?: number }) {
  const statusN = normalizeReachability(device.status);
  const isDormant = /dormant/i.test(device.status || "");
  // Meraki: un dispositivo sin IP de gestión (uplink por mesh) se muestra como "repeater".
  const isRepeater = !device.lanIp;

  const kind: "online" | "alerting" | "offline" | "dormant" =
    isDormant ? "dormant" : statusN === "connected" ? "online" : statusN === "warning" ? "alerting" : "offline";

  const color = kind === "online" ? "#22c55e" : kind === "alerting" ? "#f59e0b" : kind === "offline" ? "#ef4444" : "#94a3b8";
  const statusLabel = kind === "online" ? "Online" : kind === "alerting" ? "Alerting" : kind === "offline" ? "Offline" : "Dormant";
  const label = isRepeater && !isDormant ? `${statusLabel} repeater` : statusLabel;

  const Glyph = ({ stroke }: { stroke: string }) => {
    if (kind === "online") return <path d="M8 12.4l2.6 2.6L16 9.6" fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" />;
    if (kind === "offline") return <path d="M9 9l6 6M15 9l-6 6" fill="none" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" />;
    if (kind === "alerting") return <><path d="M12 7.6v5.2" stroke={stroke} strokeWidth={2.4} strokeLinecap="round" /><circle cx={12} cy={16.4} r={1.3} fill={stroke} /></>;
    return null; // dormant: sin glifo
  };

  return (
    <Tooltip content={label} position="top">
      <span style={{ display: "inline-flex", cursor: "pointer" }} aria-label={label} role="img">
        <svg width={size} height={size} viewBox="0 0 24 24">
          {isRepeater ? (
            <>
              {/* Repeater = círculo punteado (como el Dashboard de Meraki) */}
              <circle cx={12} cy={12} r={10} fill={color} fillOpacity={0.10} stroke={color} strokeWidth={2} strokeLinecap="round" strokeDasharray="1.4 4.6" />
              <Glyph stroke={color} />
            </>
          ) : (
            <>
              <circle cx={12} cy={12} r={10} fill={color} />
              <Glyph stroke="#ffffff" />
            </>
          )}
        </svg>
      </span>
    </Tooltip>
  );
}
