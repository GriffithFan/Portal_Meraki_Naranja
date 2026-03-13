"use client";
import { useState, useCallback } from "react";
import { DEFAULT_UPLINK_TIMESPAN, DEFAULT_UPLINK_RESOLUTION } from "@/utils/constants";
import type { MerakiNetwork } from "@/types/meraki";

export const useDashboardData = () => {
  const [selectedNetwork, setSelectedNetwork] = useState<MerakiNetwork | null>(null);
  const [summaryData, setSummaryData] = useState<Record<string, unknown> | null>(null);
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());
  const [sectionLoading, setSectionLoading] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uplinkRange, setUplinkRange] = useState<number>(DEFAULT_UPLINK_TIMESPAN);
  const [error, setError] = useState("");
  const [enrichedAPs, setEnrichedAPs] = useState<Record<string, unknown>[] | null>(null);

  /**
   * Carga una sección específica bajo demanda
   */
  const loadSection = useCallback(
    async (sectionKey: string, { force = false } = {}) => {
      if (!selectedNetwork?.id) return;
      if (loadedSections.has(sectionKey) && !force) return;

      setSectionLoading(sectionKey);
      try {
        const params = new URLSearchParams();
        if (sectionKey === "appliance_status") {
          params.set("uplinkTimespan", String(uplinkRange || DEFAULT_UPLINK_TIMESPAN));
          params.set("uplinkResolution", String(DEFAULT_UPLINK_RESOLUTION));
        }
        const url = `/api/meraki/networks/${selectedNetwork.id}/section/${sectionKey}${params.toString() ? `?${params}` : ""}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Error cargando sección ${sectionKey}`);
        const sectionData = await res.json();

        setSummaryData((prev: Record<string, unknown> | null) => {
          const merged = { ...prev };
          switch (sectionKey) {
            case "topology":
              merged.topology = sectionData.topology;
              if (sectionData.devices && !prev?.devices) merged.devices = sectionData.devices;
              break;
            case "switches":
              merged.switches = sectionData.switches;
              merged.switchesOverview = sectionData.switchesOverview;
              merged.accessControlLists = sectionData.accessControlLists;
              break;
            case "access_points":
              merged.accessPoints = sectionData.accessPoints;
              merged.networkWirelessStats = sectionData.networkWirelessStats;
              merged.wirelessSignalByDevice = sectionData.wirelessSignalByDevice;
              merged.wirelessSignalHistory = sectionData.wirelessSignalHistory;
              merged.wirelessFailedConnections = sectionData.wirelessFailedConnections;
              break;
            case "appliance_status":
              merged.applianceStatus = sectionData.applianceStatus;
              if (sectionData.topology) merged.topology = sectionData.topology;
              break;
          }
          return merged;
        });
        setLoadedSections((prev) => new Set(prev).add(sectionKey));
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`Error cargando '${sectionKey}':`, err);
        setError(`Error cargando ${sectionKey}: ${message}`);
      } finally {
        setSectionLoading(null);
      }
    },
    [selectedNetwork, loadedSections, uplinkRange]
  );

  /**
   * Selecciona una red y limpia datos anteriores
   */
  const selectNetwork = useCallback((network: MerakiNetwork) => {
    setSelectedNetwork(network);
    setSummaryData(null);
    setLoadedSections(new Set());
    setEnrichedAPs(null);
    setError("");
    setLoading(false);
  }, []);

  /**
   * Carga datos enriquecidos de Access Points
   */
  const loadEnrichedAPs = useCallback(async (networkId: string) => {
    setEnrichedAPs(null);
    try {
      const res = await fetch(`/api/meraki/networks/${networkId}/section/access_points`);
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.accessPoints)) setEnrichedAPs(data.accessPoints);
      }
    } catch (err) {
      console.error("Error cargando datos completos de APs:", err);
    }
  }, []);

  return {
    selectedNetwork,
    summaryData,
    loadedSections,
    sectionLoading,
    loading,
    uplinkRange,
    error,
    enrichedAPs,
    setSelectedNetwork: selectNetwork,
    setSummaryData,
    setUplinkRange,
    setError,
    setEnrichedAPs,
    loadSection,
    loadEnrichedAPs,
  };
};
