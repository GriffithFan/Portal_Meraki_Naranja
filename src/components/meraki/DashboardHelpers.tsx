"use client";

export const SummaryChip = ({ label, value, accent = "#1f2937" }: { label: string; value: string | number; accent?: string }) => (
  <div className="summary-chip">
    <div className="summary-chip-label">{label}</div>
    <div className="summary-chip-value" style={{ color: accent }}>{value}</div>
  </div>
);
