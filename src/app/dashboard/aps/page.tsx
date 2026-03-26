"use client";
import AccessPointsSection from "@/components/meraki/AccessPointsSection";
import ExportableSection from "@/components/ui/ExportableSection";
import { useNetworkContext } from "@/contexts/NetworkContext";

export default function APsPage() {
  const { selectedNetwork, summaryData, loadedSections, sectionLoading, loadSection } = useNetworkContext();

  return (
    <div className="animate-fade-in-up">
      <ExportableSection sectionName="Access Points" title="Puntos de Acceso" subtitle="Estado y señal de access points Meraki">
        {!selectedNetwork ? (
          <div className="py-20 px-5 text-center text-surface-400 text-sm">Seleccioná una red desde la barra superior para ver sus puntos de acceso</div>
        ) : (
          <AccessPointsSection summaryData={summaryData} loadedSections={loadedSections} sectionLoading={sectionLoading} loadSection={loadSection} />
        )}
      </ExportableSection>
    </div>
  );
}
