"use client";
import { useState, useEffect, useRef, useCallback, type MutableRefObject } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface NetworkSelectorProps {
  onSelect: (network: any) => void;
  selectedNetwork: any;
}

export default function NetworkSelector({ onSelect, selectedNetwork }: NetworkSelectorProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const abortRef = useRef<AbortController | null>(null) as MutableRefObject<AbortController | null>;

  const search = useCallback(async (q: string) => {
    if (q.length < 2) { setResults([]); return; }
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    try {
      const res = await fetch(`/api/meraki/networks/search?q=${encodeURIComponent(q)}`, { credentials: "include", signal: controller.signal });
      if (res.ok) {
        const data = await res.json();
        setResults(Array.isArray(data) ? data : data.networks || []);
        setIsOpen(true);
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") { /* ignore */ }
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => search(query), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, [query, search]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectNetwork = (net: any) => {
    onSelect(net);
    setQuery("");
    setIsOpen(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;

    // If dropdown results exist, select the first one
    if (results.length > 0) {
      selectNetwork(results[0]);
      return;
    }

    // Try instant resolve via DB (predio code → network)
    if (q.length >= 2) {
      setLoading(true);
      try {
        const res = await fetch(`/api/meraki/resolve-network?q=${encodeURIComponent(q)}`, { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          if (data.network) {
            selectNetwork({
              ...data.network,
              orgId: data.predio?.orgId || data.network.organizationId,
              orgName: data.network.orgName || "",
              predioCode: data.predio?.codigo,
            });
            return;
          }
        }
      } catch { /* fallback to search */ }

      // Fallback: trigger search
      await search(q);
      setLoading(false);
    }
  };

  const displayLabel = selectedNetwork
    ? `${selectedNetwork.name}${selectedNetwork.orgName || selectedNetwork.organizationName ? ` — ${selectedNetwork.orgName || selectedNetwork.organizationName}` : ""}`
    : "";

  return (
    <div ref={containerRef} style={{ position: "relative", maxWidth: "480px", width: "100%" }}>
      <form onSubmit={handleSubmit} style={{ position: "relative" }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder={displayLabel || "Buscar red Meraki..."}
          style={{ width: "100%", padding: "10px 40px 10px 14px", fontSize: "14px", border: "1px solid #d1d5db", borderRadius: "8px", outline: "none", background: "white", color: "#1e293b", fontFamily: "inherit" }}
        />
        {loading && <div style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", width: "18px", height: "18px", border: "2px solid #e5e7eb", borderTop: "2px solid #3b82f6", borderRadius: "50%", animation: "spin 0.6s linear infinite" }} />}
        {!loading && <button type="submit" style={{ position: "absolute", right: "8px", top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", padding: "4px", color: "#9ca3af" }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>}
      </form>

      {isOpen && results.length > 0 && (
        <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: "4px", background: "white", border: "1px solid #d1d5db", borderRadius: "8px", boxShadow: "0 10px 38px -10px rgba(0,0,0,0.15)", maxHeight: "320px", overflowY: "auto", zIndex: 50 }}>
          {results.map((net) => (
            <div
              key={net.id}
              onClick={() => selectNetwork(net)}
              style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #f1f5f9", fontSize: "14px", color: "#1e293b", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "#f8fafc")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "white")}
            >
              <span style={{ fontWeight: "500" }}>{net.name}</span>
              {(net.orgName || net.organizationName) && <span style={{ fontSize: "12px", color: "#94a3b8" }}>{net.orgName || net.organizationName}</span>}
            </div>
          ))}
        </div>
      )}

      {selectedNetwork && (
        <div style={{ marginTop: "8px", display: "flex", alignItems: "center", gap: "8px", padding: "6px 12px", background: "#eff6ff", borderRadius: "6px", fontSize: "13px", color: "#1e40af" }}>
          <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: "#3b82f6" }} />
          {displayLabel}
          <button onClick={() => onSelect(null)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "#93c5fd", fontSize: "16px", lineHeight: 1 }}>×</button>
        </div>
      )}
    </div>
  );
}
