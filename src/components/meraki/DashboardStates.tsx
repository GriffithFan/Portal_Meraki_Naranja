"use client";

export const LoadingState = ({ message = "Cargando datos del predio…" }: { message?: string }) => (
  <div className="loading">{message}</div>
);

export const EmptyState = ({ message = "Busca un predio en la barra superior…" }: { message?: string }) => (
  <div className="empty-predio">{message}</div>
);

export const NoDataState = ({ message = "No hay datos disponibles para este predio." }: { message?: string }) => (
  <div>{message}</div>
);

export const LoadingSpinner = ({ section }: { section: string }) => {
  const sectionNames: Record<string, string> = {
    topology: "topología",
    switches: "switches",
    access_points: "puntos de acceso",
    appliance_status: "estado de appliances",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 20px", gap: "16px" }}>
      <div className="loading-spinner" />
      <div className="loading-spinner-text">Cargando {sectionNames[section] || section}...</div>
    </div>
  );
};
