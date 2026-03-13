"use client";
import TopologySection from "@/components/meraki/TopologySection";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";

export default function TopologiaPage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Topología de Red</h1>
      <p className="text-xs text-surface-400 mb-6">Visualización de la topología de red Meraki</p>

      {!selectedNetwork ? (
        <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver su topología</div>
      ) : (
        <ExportableSection sectionName="Topologia">
          <TopologySection summaryData={summaryData} loadedSections={loadedSections} sectionLoading={sectionLoading} loadSection={loadSection} />
        </ExportableSection>
      )}
    </div>
  );
}
