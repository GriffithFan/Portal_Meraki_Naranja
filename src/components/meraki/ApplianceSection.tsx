"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "./DashboardStates";
import AppliancePortsMatrix from "./AppliancePortsMatrix";
import { useNetworkContext } from "@/contexts/NetworkContext";
import { enrichPortsWithConnections, deriveConnectedPortsFromTopology } from "@/utils/applianceUtils";
import "./AppliancePorts.css";

/* eslint-disable @typescript-eslint/no-explicit-any */

const ApplianceHistoricalCharts = dynamic(() => import("./ApplianceHistoricalCharts"), { ssr: false });

interface ApplianceSectionProps {
  networkId: string;
  summaryData: any;
  loadedSections: Set<string>;
  sectionLoading: string | null;
  loadSection: (key: string) => Promise<void>;
}

export default function ApplianceSection({ networkId, summaryData, loadedSections, sectionLoading, loadSection }: ApplianceSectionProps) {
  const { selectedNetwork } = useNetworkContext();
  useEffect(() => {
    if (!loadedSections.has("appliance_status")) loadSection("appliance_status");
  }, [loadedSections, loadSection]);

  if (sectionLoading === "appliance_status" || !loadedSections.has("appliance_status")) return <LoadingSpinner section="appliance_status" />;

  const applianceStatus = summaryData?.applianceStatus || {};
  const devices: any[] = applianceStatus.devices || [];
  const topology = applianceStatus.topology || summaryData?.topology;
  const uplinks: any[] = applianceStatus.uplinks || [];

  // Derive networkName and deviceCount for USAP detection in AppliancePortsMatrix
  const networkName = selectedNetwork?.name || "";
  const allDevices: any[] = summaryData?.devices || devices;
  const deviceCount = {
    aps: allDevices.filter((d: any) => /^mr/i.test(d.model || "")).length,
    hasMX: allDevices.some((d: any) => /^mx|^z[13]/i.test(d.model || "")),
  };

  if (devices.length === 0 && uplinks.length === 0) {
    return <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No hay datos de appliance disponibles para esta red.</div>;
  }

  return (
    <div>
      {/* Dispositivos con detalle */}
      {devices.map((device: any) => {
        const rawPorts = device.ports || [];
        const deviceUplinks = uplinks.filter((u: any) => u.serial === device.serial);
        const ports = enrichPortsWithConnections(rawPorts, device.serial, topology);
        const connectedOverrides = deriveConnectedPortsFromTopology(device.serial, topology);
        const statusN = (device.status || "").toLowerCase();
        const statusColor = statusN === "online" ? "#22c55e" : statusN === "offline" ? "#ef4444" : "#f59e0b";
        const statusBg = statusColor === "#22c55e" ? "#d1fae5" : statusColor === "#ef4444" ? "#fee2e2" : "#fef3c7";

        return (
          <div key={device.serial || device.name} style={{ marginBottom: "32px", padding: "20px", background: "#fff", borderRadius: "12px", border: "1px solid #cbd5e1" }}>
            {/* Header: name + status badge */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingBottom: "16px", borderBottom: "2px solid #e2e8f0", marginBottom: "16px", flexWrap: "wrap", gap: "8px" }}>
              <div>
                <h3 style={{ margin: 0, fontSize: "1.2em", color: "#1e293b" }}>{device.name || device.mac}</h3>
                <div style={{ fontSize: "13px", color: "#64748b", marginTop: "4px" }}>LAN IP: <b>{device.lanIp || "-"}</b></div>
              </div>
              <span style={{ padding: "6px 16px", borderRadius: "999px", fontSize: "13px", fontWeight: "600", background: statusBg, color: statusColor }}>
                {device.status}
              </span>
            </div>

            {/* Ports matrix + Uplink details — responsive: stack on mobile */}
            <div className="grid grid-cols-1 md:grid-cols-[auto_1fr]" style={{ gap: "20px", marginBottom: "16px" }}>
              <AppliancePortsMatrix ports={ports} model={device.model} uplinks={deviceUplinks} connectedOverrides={connectedOverrides} networkName={networkName} deviceCount={deviceCount} />

              {deviceUplinks.length > 0 && (
                <div style={{ border: "1px solid #cbd5e1", borderRadius: "10px", padding: "14px", background: "#f8fafc", display: "flex", flexDirection: "column", gap: "10px", height: "fit-content" }}>
                  {deviceUplinks.map((uplink: any, i: number) => {
                    const uStatus = (uplink.status || "").toLowerCase();
                    const isActive = uStatus === "active" || uStatus === "ready" || uStatus === "connected";
                    const uStatusLabel = isActive ? "active" : "not connected";
                    const uBadgeColor = isActive ? "#22c55e" : "#ef4444";
                    return (
                      <div key={`${uplink.interface}-${i}`} style={{ marginBottom: "6px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                          <span style={{ fontSize: "16px", fontWeight: "700", color: "#0f172a" }}>{uplink.interface}</span>
                          <span style={{ background: uBadgeColor, color: "#fff", padding: "3px 10px", borderRadius: "999px", fontSize: "11px", fontWeight: "600" }}>{uStatusLabel}</span>
                        </div>
                        {/* Dispositivo info block */}
                        <div style={{ padding: "10px", background: "#ffffff", borderRadius: "6px", border: "1px solid #e2e8f0", marginBottom: "6px" }}>
                          <div style={{ fontSize: "11px", color: "#64748b", fontWeight: "600", marginBottom: "6px", textTransform: "uppercase" as const, letterSpacing: "0.5px" }}>Dispositivo</div>
                          <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 8px", fontSize: "12px" }}>
                            <span style={{ color: "#64748b" }}>Modelo:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{device.model}</span>
                            <span style={{ color: "#64748b" }}>Serial:</span><span style={{ fontWeight: "500", color: "#0f172a" }}>{device.serial}</span>
                            <span style={{ color: "#64748b" }}>MAC:</span><span style={{ fontFamily: "monospace", color: "#0f172a" }}>{device.mac || "-"}</span>
                          </div>
                        </div>
                        {/* Network info block */}
                        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 8px", fontSize: "12px", padding: "6px 0" }}>
                          <span style={{ color: "#64748b" }}>IP:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{uplink.ip || "-"}</span>
                          <span style={{ color: "#64748b" }}>Public IP:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{uplink.publicIp || "-"}</span>
                          <span style={{ color: "#64748b" }}>Gateway:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{uplink.gateway || "-"}</span>
                          {uplink.dns && <><span style={{ color: "#64748b" }}>DNS:</span><span style={{ color: "#0f172a" }}>{Array.isArray(uplink.dns) ? uplink.dns.join(", ") : uplink.dns}</span></>}
                          {uplink.provider && <><span style={{ color: "#64748b" }}>Provider:</span><span style={{ color: "#0f172a" }}>{uplink.provider}</span></>}
                          {uplink.connectionType && <><span style={{ color: "#64748b" }}>Tipo conexión:</span><span style={{ color: "#0f172a" }}>{uplink.connectionType}</span></>}
                          {uplink.loss != null && <><span style={{ color: "#64748b" }}>Loss:</span><span style={{ fontWeight: "600", color: uplink.loss > 0 ? "#dc2626" : "#0f172a" }}>{uplink.loss}%</span></>}
                          {uplink.latency != null && <><span style={{ color: "#64748b" }}>Latency:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{uplink.latency} ms</span></>}
                          {uplink.jitter != null && <><span style={{ color: "#64748b" }}>Jitter:</span><span style={{ fontWeight: "600", color: "#0f172a" }}>{uplink.jitter} ms</span></>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Históricos */}
      <ApplianceHistoricalCharts networkId={networkId} />
    </div>
  );
}
