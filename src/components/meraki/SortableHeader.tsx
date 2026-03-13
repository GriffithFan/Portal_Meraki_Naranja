"use client";

export const SortableHeader = ({
  label,
  sortKey,
  sortConfig,
  onSort,
  align = "left",
  width,
}: {
  label: string;
  sortKey: string;
  sortConfig: { key: string | null; direction: "asc" | "desc" };
  onSort: (key: string) => void;
  align?: "left" | "center" | "right";
  width?: string | number;
}) => {
  const isActive = sortConfig.key === sortKey;
  const direction = isActive ? sortConfig.direction : null;

  return (
    <th
      style={{ textAlign: align, width, cursor: "pointer", userSelect: "none", position: "relative", padding: "10px 10px", paddingRight: "20px" }}
      onClick={() => onSort(sortKey)}
    >
      <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
        {label}
        <span style={{ display: "inline-flex", flexDirection: "column", marginLeft: "2px", opacity: isActive ? 1 : 0.3 }}>
          <span style={{ fontSize: "8px", lineHeight: "6px", color: isActive && direction === "asc" ? "#2563eb" : "#94a3b8" }}>▲</span>
          <span style={{ fontSize: "8px", lineHeight: "6px", color: isActive && direction === "desc" ? "#2563eb" : "#94a3b8" }}>▼</span>
        </span>
      </div>
    </th>
  );
};
