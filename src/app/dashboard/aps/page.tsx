"use client";
import AccessPointsSection from "@/components/meraki/AccessPointsSection";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";

export default function APsPage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();

  return (
    <div className="animate-fade-in-up">
      <h1 className="text-xl font-semibold text-surface-800 mb-1">Puntos de Acceso</h1>
      <p className="text-xs text-surface-400 mb-6">Estado y señal de access points Meraki</p>

      {!selectedNetwork ? (
        <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver sus puntos de acceso</div>
      ) : (
        <ExportableSection sectionName="Access Points">
          <AccessPointsSection summaryData={summaryData} loadedSections={loadedSections} sectionLoading={sectionLoading} loadSection={loadSection} />
        </ExportableSection>
      )}
    </div>
  );
}
