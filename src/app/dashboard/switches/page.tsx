"use client";
import { useEffect } from "react";
import SwitchesSection from "@/components/meraki/SwitchesSection";
import { LoadingSpinner } from "@/components/meraki/DashboardStates";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";
import { useTableSort } from "@/hooks/useTableSort";

export default function SwitchesPage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();
  const { sortData, sortConfig, handleSort } = useTableSort();

  useEffect(() => {
    if (selectedNetwork && !loadedSections.has("switches")) loadSection("switches");
  }, [selectedNetwork, loadedSections, loadSection]);

  const switchesDetailed = summaryData?.switches || [];

  return (
    <div className="animate-fade-in-up">
      <ExportableSection sectionName="Switches" title="Switches" subtitle="Estado y puertos de switches Meraki">
        {!selectedNetwork ? (
          <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver sus switches</div>
        ) : sectionLoading === "switches" || !loadedSections.has("switches") ? (
          <LoadingSpinner section="switches" />
        ) : (
          <SwitchesSection switchesDetailed={switchesDetailed} sortData={sortData} sortConfig={sortConfig} handleSort={handleSort} />
        )}
      </ExportableSection>
    </div>
  );
}
