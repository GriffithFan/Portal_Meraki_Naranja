"use client";
import { useEffect } from "react";
import dynamic from "next/dynamic";
import { LoadingSpinner } from "./DashboardStates";

/* eslint-disable @typescript-eslint/no-explicit-any */

const SimpleGraph = dynamic(() => import("./SimpleGraph"), { ssr: false });

interface TopologySectionProps {
  summaryData: any;
  loadedSections: Set<string>;
  sectionLoading: string | null;
  loadSection: (key: string) => Promise<void>;
}

export default function TopologySection({ summaryData, loadedSections, sectionLoading, loadSection }: TopologySectionProps) {
  useEffect(() => {
    if (!loadedSections.has("topology")) loadSection("topology");
  }, [loadedSections, loadSection]);

  if (sectionLoading === "topology" || !loadedSections.has("topology")) return <LoadingSpinner section="topology" />;

  const topology = summaryData?.topology;
  if (!topology || (!topology.nodes?.length && !topology.links?.length)) {
    return <div style={{ padding: "60px 20px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>No hay datos de topología disponibles para esta red.</div>;
  }

  return (
    <div>
      <SimpleGraph graph={topology} devices={summaryData?.devices} />
    </div>
  );
}
