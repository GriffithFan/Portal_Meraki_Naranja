"use client";
import { useState, useCallback, useMemo } from "react";
import { normalizeReachability } from "@/utils/networkUtils";

export const useTableSort = (defaultKey: string | null = null, defaultDirection: "asc" | "desc" = "asc") => {
  const [sortConfig, setSortConfig] = useState<{ key: string | null; direction: "asc" | "desc" }>({
    key: defaultKey,
    direction: defaultDirection,
  });

  const handleSort = useCallback((key: string) => {
    setSortConfig((prev) => {
      if (prev.key === key) return { key, direction: prev.direction === "asc" ? "desc" : "asc" };
      return { key, direction: "asc" };
    });
  }, []);

  const compareFn = useMemo(() => {
    const k = sortConfig.key;
    const d = sortConfig.direction;
    if (!k) return null;
    return (a: Record<string, unknown>, b: Record<string, unknown>) => {
      let aVal: string | number = "";
      let bVal: string | number = "";
      const rawA = a[k];
      const rawB = b[k];
      if (k === "status") {
        aVal = normalizeReachability(rawA as string);
        bVal = normalizeReachability(rawB as string);
      } else {
        aVal = rawA == null ? "" : typeof rawA === "string" ? rawA : typeof rawA === "number" ? rawA : String(rawA);
        bVal = rawB == null ? "" : typeof rawB === "string" ? rawB : typeof rawB === "number" ? rawB : String(rawB);
      }
      if (typeof aVal === "string") aVal = aVal.toLowerCase();
      if (typeof bVal === "string") bVal = bVal.toLowerCase();
      if (aVal < bVal) return d === "asc" ? -1 : 1;
      if (aVal > bVal) return d === "asc" ? 1 : -1;
      return 0;
    };
  }, [sortConfig]);

  const sortData = useCallback(<T extends Record<string, unknown>>(data: T[], key?: string | null, direction?: "asc" | "desc"): T[] => {
    if (!data) return data;
    // If custom key/direction provided, sort on-the-fly (rare path)
    if (key !== undefined || direction !== undefined) {
      const k = key ?? sortConfig.key;
      const d = direction ?? sortConfig.direction;
      if (!k) return data;
      return [...data].sort((a, b) => {
        let aVal: string | number = "";
        let bVal: string | number = "";
        const rawA = a[k];
        const rawB = b[k];
        if (k === "status") {
          aVal = normalizeReachability(rawA as string);
          bVal = normalizeReachability(rawB as string);
        } else {
          aVal = rawA == null ? "" : typeof rawA === "string" ? rawA : typeof rawA === "number" ? rawA : String(rawA);
          bVal = rawB == null ? "" : typeof rawB === "string" ? rawB : typeof rawB === "number" ? rawB : String(rawB);
        }
        if (typeof aVal === "string") aVal = aVal.toLowerCase();
        if (typeof bVal === "string") bVal = bVal.toLowerCase();
        if (aVal < bVal) return d === "asc" ? -1 : 1;
        if (aVal > bVal) return d === "asc" ? 1 : -1;
        return 0;
      });
    }
    if (!compareFn) return data;
    return [...data].sort(compareFn);
  }, [sortConfig, compareFn]);

  const resetSort = useCallback(() => {
    setSortConfig({ key: defaultKey, direction: defaultDirection });
  }, [defaultKey, defaultDirection]);

  return { sortConfig, handleSort, sortData, resetSort };
};
