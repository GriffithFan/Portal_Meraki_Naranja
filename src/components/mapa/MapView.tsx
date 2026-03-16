"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface PredioMapa {
  id: string;
  nombre: string;
  codigo: string;
  direccion: string | null;
  ciudad: string | null;
  provincia: string | null;
  latitud: number;
  longitud: number;
  tipo: string | null;
  equipoAsignado: string | null;
  ambito: string | null;
  estado: { id: string; nombre: string; color: string } | null;
}

function createMarkerIcon(color: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 36" width="24" height="36">
    <path d="M12 0C5.4 0 0 5.4 0 12c0 9 12 24 12 24s12-15 12-24C24 5.4 18.6 0 12 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="5" fill="#fff" opacity="0.9"/>
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [24, 36],
    iconAnchor: [12, 36],
    popupAnchor: [0, -36],
  });
}

export default function MapView({ predios }: { predios: PredioMapa[] }) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Calculate center from predios
  const center = useMemo(() => {
    if (predios.length === 0) return { lat: -34.6, lng: -58.4 }; // Buenos Aires default
    const sumLat = predios.reduce((s, p) => s + p.latitud, 0);
    const sumLng = predios.reduce((s, p) => s + p.longitud, 0);
    return { lat: sumLat / predios.length, lng: sumLng / predios.length };
  }, [predios]);

  // Initialize map
  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 6,
      zoomControl: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Cleanup
    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update markers when predios change
  useEffect(() => {
    const map = mapRef.current;
    const markerGroup = markersRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();

    if (predios.length === 0) return;

    const bounds = L.latLngBounds([]);

    for (const p of predios) {
      const color = p.estado?.color || "#64748b";
      const marker = L.marker([p.latitud, p.longitud], {
        icon: createMarkerIcon(color),
      });

      const estadoLabel = p.estado
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.estado.color};margin-right:4px"></span>${p.estado.nombre}`
        : "Sin estado";

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:12px;min-width:180px">
          <div style="font-weight:600;font-size:13px;margin-bottom:6px">${escapeHtml(p.nombre)}</div>
          <div style="color:#64748b;margin-bottom:8px">${escapeHtml(p.codigo)}</div>
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Estado</td><td>${estadoLabel}</td></tr>
            ${p.equipoAsignado ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Equipo</td><td>${escapeHtml(p.equipoAsignado)}</td></tr>` : ""}
            ${p.provincia ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Provincia</td><td>${escapeHtml(p.provincia)}</td></tr>` : ""}
            ${p.ciudad ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Ciudad</td><td>${escapeHtml(p.ciudad)}</td></tr>` : ""}
            ${p.direccion ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Dirección</td><td>${escapeHtml(p.direccion)}</td></tr>` : ""}
            ${p.ambito ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Ámbito</td><td>${escapeHtml(p.ambito)}</td></tr>` : ""}
          </table>
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0">
            <a href="/dashboard/tareas?search=${encodeURIComponent(p.codigo)}" style="color:#6366f1;text-decoration:none;font-size:11px">Ver en tareas →</a>
          </div>
        </div>`,
        { maxWidth: 280 }
      );

      marker.addTo(markerGroup);
      bounds.extend([p.latitud, p.longitud]);
    }

    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 14 });
  }, [predios]);

  return <div ref={containerRef} className="w-full h-full" style={{ minHeight: 500 }} />;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
