"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { obtenerProvincia } from "@/utils/provinciaUtils";

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
  nombreInstitucion: string | null;
  estado: { id: string; nombre: string; color: string } | null;
}

// Colores por provincia — cada una tiene un color distinguible
const PROVINCIA_COLORS: Record<string, string> = {
  "Buenos Aires":       "#3b82f6", // azul
  "Santa Fe":           "#f59e0b", // amarillo/ámbar
  "Entre Ríos":         "#10b981", // verde
  "Córdoba":            "#8b5cf6", // violeta
  "Mendoza":            "#ef4444", // rojo
  "Tucumán":            "#06b6d4", // cyan
  "Salta":              "#f97316", // naranja
  "Misiones":           "#84cc16", // lima
  "Chaco":              "#ec4899", // pink
  "Corrientes":         "#14b8a6", // teal
  "Santiago del Estero": "#a855f7", // púrpura
  "San Juan":           "#64748b", // gris azulado
  "Jujuy":              "#d946ef", // fucsia
  "Río Negro":          "#0ea5e9", // sky
  "Neuquén":            "#22c55e", // green
  "Formosa":            "#eab308", // yellow
  "Chubut":             "#6366f1", // indigo
  "San Luis":           "#f43f5e", // rose
  "Catamarca":          "#2dd4bf", // teal claro
  "La Rioja":           "#fb923c", // orange claro
  "La Pampa":           "#a3e635", // lime
  "Santa Cruz":         "#38bdf8", // celeste
  "Tierra del Fuego":   "#c084fc", // violet claro
  "CABA":               "#818cf8", // indigo claro
  "SGO. DEL ESTERO":    "#a855f7", // púrpura (alias)
  "Demo":               "#94a3b8", // slate
};

const DEFAULT_PROVINCIA_COLOR = "#94a3b8";

// Paleta de colores distinguibles para técnicos/equipos
const TECNICO_COLORS = [
  "#3b82f6", "#ef4444", "#22c55e", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#84cc16", "#14b8a6",
  "#6366f1", "#d946ef", "#0ea5e9", "#f43f5e", "#eab308",
];

// Lookup case-insensitive para provincias
const PROVINCIA_COLOR_MAP = new Map(
  Object.entries(PROVINCIA_COLORS).map(([k, v]) => [k.toUpperCase(), v])
);

function getProvinciaColor(provincia: string | null): string {
  if (!provincia) return DEFAULT_PROVINCIA_COLOR;
  return PROVINCIA_COLOR_MAP.get(provincia.toUpperCase()) || PROVINCIA_COLORS[provincia] || DEFAULT_PROVINCIA_COLOR;
}

function getTecnicoColor(tecnico: string | null, tecnicoColorMap: Record<string, string>): string {
  if (!tecnico) return DEFAULT_PROVINCIA_COLOR;
  return tecnicoColorMap[tecnico] || DEFAULT_PROVINCIA_COLOR;
}

function createMarkerIcon(color: string, label?: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 40" width="28" height="40">
    <path d="M14 0C6.3 0 0 6.3 0 14c0 10.5 14 26 14 26s14-15.5 14-26C28 6.3 21.7 0 14 0z" fill="${color}" stroke="#fff" stroke-width="1.5"/>
    <circle cx="14" cy="13" r="6" fill="#fff" opacity="0.9"/>
    ${label ? `<text x="14" y="16" text-anchor="middle" font-size="9" font-weight="700" fill="${color}" font-family="system-ui">${label}</text>` : ""}
  </svg>`;
  return L.divIcon({
    html: svg,
    className: "",
    iconSize: [28, 40],
    iconAnchor: [14, 40],
    popupAnchor: [0, -40],
  });
}

interface MapViewProps {
  predios: PredioMapa[];
  colorBy: "provincia" | "estado" | "tecnico";
}

export default function MapView({ predios, colorBy }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Build a stable color map for technicians
  const tecnicoColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const tecnicos = Array.from(new Set(predios.map(p => p.equipoAsignado).filter(Boolean) as string[])).sort();
    tecnicos.forEach((t, i) => { map[t] = TECNICO_COLORS[i % TECNICO_COLORS.length]; });
    return map;
  }, [predios]);

  const center = useMemo(() => {
    if (predios.length === 0) return { lat: -34.6, lng: -58.4 };
    const sumLat = predios.reduce((s, p) => s + p.latitud, 0);
    const sumLng = predios.reduce((s, p) => s + p.longitud, 0);
    return { lat: sumLat / predios.length, lng: sumLng / predios.length };
  }, [predios]);

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

    return () => {
      map.remove();
      mapRef.current = null;
      markersRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const markerGroup = markersRef.current;
    if (!map || !markerGroup) return;

    markerGroup.clearLayers();

    if (predios.length === 0) return;

    const bounds = L.latLngBounds([]);

    for (const p of predios) {
      const prov = obtenerProvincia(p.provincia, p.codigo) || null;
      const color = colorBy === "provincia"
        ? getProvinciaColor(prov)
        : colorBy === "tecnico"
        ? getTecnicoColor(p.equipoAsignado, tecnicoColorMap)
        : (p.estado?.color || DEFAULT_PROVINCIA_COLOR);

      // Label inside marker depends on colorBy mode
      const label = colorBy === "tecnico"
        ? (p.equipoAsignado ? p.equipoAsignado[0].toUpperCase() : "")
        : (prov ? prov[0].toUpperCase() : "");

      const marker = L.marker([p.latitud, p.longitud], {
        icon: createMarkerIcon(color, label),
      });

      const estadoLabel = p.estado
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.estado.color};margin-right:4px"></span>${p.estado.nombre}`
        : "Sin estado";

      const provColor = getProvinciaColor(prov);

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:12px;min-width:180px">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(p.nombre)}</div>
          <div style="color:#64748b;margin-bottom:6px;font-size:11px">${escapeHtml(p.codigo)}</div>
          ${prov ? `<div style="display:inline-flex;align-items:center;gap:4px;background:${provColor}15;border:1px solid ${provColor}40;color:${provColor};padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;margin-bottom:8px"><span style="width:6px;height:6px;border-radius:50%;background:${provColor}"></span>${escapeHtml(prov)}</div>` : ""}
          ${p.nombreInstitucion ? `<div style="color:#475569;font-size:11px;margin-bottom:6px;font-style:italic">${escapeHtml(p.nombreInstitucion)}</div>` : ""}
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Estado</td><td>${estadoLabel}</td></tr>
            ${p.equipoAsignado ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Equipo</td><td>${escapeHtml(p.equipoAsignado)}</td></tr>` : ""}
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
  }, [predios, colorBy, tecnicoColorMap]);

  return <div ref={containerRef} className="w-full h-full rounded-lg" />;
}

function escapeHtml(text: string): string {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}
