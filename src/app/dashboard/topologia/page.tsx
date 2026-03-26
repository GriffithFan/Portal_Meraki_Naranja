"use client";
import TopologySection from "@/components/meraki/TopologySection";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";

export default function TopologiaPage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();

  return (
    <div className="animate-fade-in-up">
      <ExportableSection sectionName="Topologia" title="Topología de Red" subtitle="Visualización de la topología de red Meraki">
        {!selectedNetwork ? (
          <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver su topología</div>
        ) : (
          <TopologySection summaryData={summaryData} loadedSections={loadedSections} sectionLoading={sectionLoading} loadSection={loadSection} />
        )}
      </ExportableSection>
    </div>
  );
}
