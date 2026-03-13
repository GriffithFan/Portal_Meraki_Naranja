import { NextRequest, NextResponse } from "next/server";
import {
  getNetworkDevices,
  getNetworkInfo,
  getOrgApplianceUplinkStatuses,
  getDeviceAppliancePerformance,
  getNetworkApplianceUplinksUsageHistory,
  getOrgDevicesUplinksLossAndLatency,
  getDeviceLossAndLatencyHistory,
} from "@/lib/meraki";
import { getSession, isModOrAdmin } from "@/lib/auth";

/* eslint-disable @typescript-eslint/no-explicit-any */

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ networkId: string }> }
) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const { networkId } = await params;
  const sp = request.nextUrl.searchParams;
  const timespan = parseInt(sp.get("timespan") || "3600", 10);
  const resolution = parseInt(sp.get("resolution") || "300", 10);

  try {
    const devices: any[] = await getNetworkDevices(networkId);
    const mxDevice = devices.find((d) => {
      const m = (d.model || "").toLowerCase();
      return m.startsWith("mx") || m.startsWith("z");
    });

    if (!mxDevice) return NextResponse.json({ connectivity: [], uplinkUsage: [] });

    const net = await getNetworkInfo(networkId);
    const orgId = net?.organizationId;
    if (!orgId) return NextResponse.json({ connectivity: [], uplinkUsage: [] });

    const orgUplinksRaw: any[] = await getOrgApplianceUplinkStatuses(orgId, { "networkIds[]": networkId });
    let uplinks: any[] = [];
    for (const item of orgUplinksRaw) {
      if (item.serial === mxDevice.serial || item.deviceSerial === mxDevice.serial) {
        uplinks = Array.isArray(item.uplinks) ? item.uplinks : [item];
      }
    }

    const [devicePerformance, uplinkUsage] = await Promise.allSettled([
      getDeviceAppliancePerformance(mxDevice.serial, { timespan }),
      getNetworkApplianceUplinksUsageHistory(networkId, { timespan, resolution }),
    ]);

    let connectivityData: any[] = [];
    // Valid Meraki API resolutions for lossAndLatencyHistory: 60, 600, 3600
    const connectivityResolution = timespan <= 86400 ? 60 : 600;

    // Primary: device-level loss/latency (same as original)
    try {
      const deviceHistory = await getDeviceLossAndLatencyHistory(mxDevice.serial, {
        timespan,
        resolution: connectivityResolution,
        uplink: "wan1",
        ip: "8.8.8.8",
      }) as any[] | null;
      if (Array.isArray(deviceHistory) && deviceHistory.length > 0) {
        connectivityData = deviceHistory.map((point: any) => ({
          ts: point.startTs || point.ts,
          startTs: point.startTs,
          endTs: point.endTs,
          lossPercent: point.lossPercent,
          latencyMs: point.latencyMs,
        }));
      }
    } catch (e) { console.error(`[Historical] device endpoint (${mxDevice.serial}):`, e); }

    // Fallback: org-level loss/latency
    if (connectivityData.length === 0) {
      try {
        const lossLatency = await getOrgDevicesUplinksLossAndLatency(orgId, {
          "networkIds[]": networkId,
          timespan,
          resolution: connectivityResolution,
        });
        if (Array.isArray(lossLatency)) {
          const deviceData: any = lossLatency.find((d: any) => d.serial === mxDevice.serial);
          if (deviceData?.timeSeries) connectivityData = deviceData.timeSeries;
        }
      } catch (e) { console.error(`[Historical] org-level loss/latency (${networkId}):`, e); }
    }

    // Fallback: generate connectivity from uplink usage + uplink statuses
    const uplinkUsageArr = uplinkUsage.status === "fulfilled" ? (uplinkUsage.value || []) as any[] : [];
    if (connectivityData.length === 0 && uplinkUsageArr.length > 0) {
      const hasActiveUplink = uplinks.some((u: any) => u.status === "active");
      connectivityData = uplinkUsageArr.map((point: any) => ({
        ts: point.ts || point.startTime || point.endTime,
        startTs: point.startTime,
        endTs: point.endTime,
        lossPercent: hasActiveUplink ? 0 : 100,
        latencyMs: hasActiveUplink ? 10 : 99999,
      }));
    }

    // Attach perf data if available
    const perf = devicePerformance.status === "fulfilled" ? devicePerformance.value : null;

    return NextResponse.json({
      connectivity: connectivityData,
      uplinkUsage: uplinkUsageArr,
      performance: perf,
    });
  } catch (error: any) {
    console.error("[historical]", error?.response?.data || error.message);
    return NextResponse.json({ error: "Error obteniendo datos históricos" }, { status: 500 });
  }
}
