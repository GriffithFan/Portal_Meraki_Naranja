"use client";
import ApplianceSection from "@/components/meraki/ApplianceSection";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";

export default function AppliancePage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();

  return (
    <div className="animate-fade-in-up">
      <ExportableSection sectionName="Appliance Status" title="Appliance Status" subtitle="Estado, puertos y datos históricos del appliance">
        {!selectedNetwork ? (
          <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver su appliance</div>
        ) : (
          <ApplianceSection networkId={selectedNetwork.id} summaryData={summaryData} loadedSections={loadedSections} sectionLoading={sectionLoading} loadSection={loadSection} />
        )}
      </ExportableSection>
    </div>
  );
}
