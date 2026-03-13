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
      <div style={{ width: "48px", height: "48px", border: "4px solid #e5e7eb", borderTop: "4px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <div style={{ fontSize: "14px", color: "#64748b", fontWeight: "500" }}>Cargando {sectionNames[section] || section}...</div>
    </div>
  );
};
