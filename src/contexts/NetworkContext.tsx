"use client";
import { createContext, useContext, useState, useCallback, useRef, ReactNode } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NetworkContextType {
  selectedNetwork: any;
  setSelectedNetwork: (network: any) => void;
  summaryData: any;
  setSummaryData: React.Dispatch<React.SetStateAction<any>>;
  loadedSections: Set<string>;
  sectionLoading: string | null;
  sectionsLoading: Set<string>;
  loadSection: (sectionKey: string, opts?: { force?: boolean }) => Promise<void>;
}

const NetworkContext = createContext<NetworkContextType | null>(null);

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

export function useNetworkContext() {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetworkContext must be used within NetworkProvider");
  return ctx;
}

export function NetworkProvider({ children }: { children: ReactNode }) {
  const [selectedNetwork, setSelectedNetworkRaw] = useState<any>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loadedSections, setLoadedSections] = useState<Set<string>>(new Set());
  const [sectionLoading, setSectionLoading] = useState<string | null>(null);
  const [sectionsLoading, setSectionsLoading] = useState<Set<string>>(new Set());
  const loadingRef = useRef<Set<string>>(new Set());
  const cacheTTL = useRef<Map<string, number>>(new Map()); // sectionKey → timestamp

  const selectNetwork = useCallback((network: any) => {
    setSelectedNetworkRaw(network);
    setSummaryData(null);
    setLoadedSections(new Set());
    loadingRef.current = new Set();
    cacheTTL.current.clear();
    setSectionLoading(null);
    setSectionsLoading(new Set());
  }, []);

  const loadSection = useCallback(
    async (sectionKey: string, { force = false } = {}) => {
      const netId = selectedNetwork?.id;
      if (!netId) return;

      // Use ref for immediate synchronous check to prevent double-fetch
      if (loadingRef.current.has(sectionKey) && !force) return;

      // Check TTL: if cached data is still fresh, skip unless forced
      const cachedAt = cacheTTL.current.get(sectionKey);
      if (!force && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) return;

      loadingRef.current.add(sectionKey);

      setSectionLoading(sectionKey);
      setSectionsLoading((prev) => new Set(prev).add(sectionKey));
      try {
        const forceParam = force ? "?force=true" : "";
        const url = `/api/meraki/networks/${netId}/section/${sectionKey}${forceParam}`;
        const res = await fetch(url, { credentials: "include" });
        if (!res.ok) throw new Error(`Error cargando sección ${sectionKey}`);
        const data = await res.json();

        setSummaryData((prev: any) => {
          const merged = { ...prev };
          switch (sectionKey) {
            case "topology":
              merged.topology = data.topology;
              if (data.devices && !prev?.devices) merged.devices = data.devices;
              break;
            case "switches":
              merged.switches = data.switches;
              merged.switchesOverview = data.switchesOverview;
              merged.accessControlLists = data.accessControlLists;
              break;
            case "access_points":
              merged.accessPoints = data.accessPoints;
              merged.networkWirelessStats = data.networkWirelessStats;
              merged.wirelessSignalByDevice = data.wirelessSignalByDevice;
              merged.wirelessSignalHistory = data.wirelessSignalHistory;
              merged.wirelessFailedConnections = data.wirelessFailedConnections;
              break;
            case "appliance_status":
              merged.applianceStatus = data.applianceStatus;
              if (data.topology) merged.topology = data.topology;
              break;
          }
          return merged;
        });
        setLoadedSections((prev) => new Set(prev).add(sectionKey));
        cacheTTL.current.set(sectionKey, Date.now());
      } catch (err) {
        console.error(`Error cargando '${sectionKey}':`, err);
        // Add to loadedSections to prevent infinite loading spinner
        setLoadedSections((prev) => new Set(prev).add(sectionKey));
      } finally {
        setSectionsLoading((prev) => {
          const next = new Set(prev);
          next.delete(sectionKey);
          return next;
        });
        setSectionLoading((prev) => prev === sectionKey ? null : prev);
      }
    },
    [selectedNetwork]
  );

  // Prefetch: al seleccionar red, cargar todas las secciones en paralelo
  const prefetchedRef = useRef<string | null>(null);
  const ALL_SECTIONS = ["topology", "switches", "access_points", "appliance_status"];

  // Use useEffect for prefetch - runs when selectedNetwork changes
  // We use a separate ref to track which network we prefetched for
  const loadSectionRef = useRef(loadSection);
  loadSectionRef.current = loadSection;

  // Trigger prefetch when network is selected
  if (selectedNetwork?.id && prefetchedRef.current !== selectedNetwork.id) {
    prefetchedRef.current = selectedNetwork.id;
    // Schedule prefetch in next microtask to avoid state updates during render
    Promise.resolve().then(() => {
      ALL_SECTIONS.forEach((key) => loadSectionRef.current(key));
    });
  }

  return (
    <NetworkContext.Provider
      value={{
        selectedNetwork,
        setSelectedNetwork: selectNetwork,
        summaryData,
        setSummaryData,
        loadedSections,
        sectionLoading,
        sectionsLoading,
        loadSection,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}
