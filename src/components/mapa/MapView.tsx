"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { obtenerProvincia } from "@/utils/provinciaUtils";
import { estadoVentana, type VentanaEstado } from "@/lib/cronogramaVentana";

// Colores por estado de ventana del cronograma (mismos que el resto del planning).
const VENTANA_COLORS: Record<VentanaEstado, string> = {
  en_ventana: "#10b981", // verde
  por_vencer: "#f59e0b", // ámbar
  vencido:    "#ef4444", // rojo
  futuro:     "#3b82f6", // azul
  sin_fechas: "#94a3b8", // gris
};

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
  asignaciones?: { usuario: { id?: string; nombre: string | null } }[];
  ambito: string | null;
  lacR?: string | null;
  nombreInstitucion: string | null;
  espacioId: string | null;
  estado: { id: string; nombre: string; color: string } | null;
  fechaDesde?: string | null;
  fechaHasta?: string | null;
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

// Paleta de colores distinguibles para asignados
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

function getTecnicoColor(tecnico: string, tecnicoColorMap: Record<string, string>): string {
  return tecnicoColorMap[tecnico] || DEFAULT_PROVINCIA_COLOR;
}

function getAsignados(predio: PredioMapa) {
  return (predio.asignaciones || []).map((asignacion) => asignacion.usuario?.nombre).filter(Boolean) as string[];
}

/**
 * A partir de cuantos predios se dibuja en canvas en vez de con marcadores del DOM.
 *
 * Cada pin es un divIcon con un SVG adentro: unos 4,4 nodos de DOM por predio. Con 2.525
 * predios la pantalla del mapa tenia 11.157 nodos, y un telefono de gama media se arrastra
 * mucho antes de eso. Con 10.000 predios —el numero del que hablamos para el año que
 * viene— serian mas de 44.000 y el navegador directamente no responde.
 *
 * En canvas todos los puntos se dibujan sobre UN solo elemento: los nodos de DOM dejan de
 * crecer con la cantidad de predios. Se pierde la letra dentro del pin, que a esta escala
 * es ilegible igual y cuya informacion ya esta en el color. Con pocos predios se mantiene
 * el pin detallado, que es cuando de verdad se lee.
 */
const UMBRAL_CANVAS = 300;

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
  colorBy: "provincia" | "estado" | "tecnico" | "ventana";
}

export default function MapView({ predios, colorBy }: MapViewProps) {
  const mapRef = useRef<L.Map | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<L.LayerGroup | null>(null);

  // Build a stable color map for technicians
  const tecnicoColorMap = useMemo(() => {
    const map: Record<string, string> = {};
    const tecnicos = Array.from(new Set(predios.flatMap(getAsignados))).sort();
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

    let limpiezaTamano = () => {};
    const map = L.map(containerRef.current, {
      center: [center.lat, center.lng],
      zoom: 6,
      zoomControl: true,
      preferCanvas: true,
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;

    // Leaflet mide el contenedor UNA sola vez, al crearse: si todavia no tiene su tamaño
    // final el mapa queda en blanco y no se recupera solo, sin dar error. invalidateSize
    // le dice que vuelva a medir — al toque, en el cuadro siguiente, y ante cada cambio
    // de tamaño del contenedor.
    const remedir = () => { try { map.invalidateSize(); } catch { /* mapa ya destruido */ } };
    remedir();
    const alFrame = requestAnimationFrame(remedir);
    const alRato = setTimeout(remedir, 400);
    const roTam = new ResizeObserver(remedir);
    if (containerRef.current) roTam.observe(containerRef.current);
    limpiezaTamano = () => { cancelAnimationFrame(alFrame); clearTimeout(alRato); roTam.disconnect(); };

    // ── User location tracking ──
    const userMarkerRef: { marker: L.Marker | null; circle: L.Circle | null } = { marker: null, circle: null };

    const userIcon = L.divIcon({
      html: `<div style="position:relative;width:18px;height:18px">
        <div style="position:absolute;inset:0;background:#3b82f6;border:2.5px solid #fff;border-radius:50%;box-shadow:0 0 6px rgba(59,130,246,.5)"></div>
        <div style="position:absolute;inset:-6px;border-radius:50%;background:rgba(59,130,246,.2);animation:pulse-loc 2s ease-out infinite"></div>
      </div>
      <style>@keyframes pulse-loc{0%{transform:scale(.8);opacity:.8}100%{transform:scale(2.2);opacity:0}}</style>`,
      className: "",
      iconSize: [18, 18],
      iconAnchor: [9, 9],
    });

    map.on("locationfound", (e: L.LocationEvent) => {
      const { lat, lng } = e.latlng;
      const radius = e.accuracy / 2;
      if (userMarkerRef.marker) {
        userMarkerRef.marker.setLatLng([lat, lng]);
        userMarkerRef.circle?.setLatLng([lat, lng]).setRadius(radius);
      } else {
        userMarkerRef.circle = L.circle([lat, lng], { radius, color: "#3b82f6", fillColor: "#3b82f680", fillOpacity: 0.15, weight: 1 }).addTo(map);
        userMarkerRef.marker = L.marker([lat, lng], { icon: userIcon, zIndexOffset: 1000 })
          .bindPopup(`<div style="font-family:system-ui;font-size:12px;text-align:center"><b>Tu ubicación</b><br/><span style="color:#64748b;font-size:10px">±${Math.round(radius)}m</span></div>`)
          .addTo(map);
      }
    });

    map.locate({ watch: true, enableHighAccuracy: true, maxZoom: 16 });

    return () => {
      limpiezaTamano();
      map.stopLocate();
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
    const usarCanvas = predios.length > UMBRAL_CANVAS;
    const rendererCanvas = usarCanvas ? L.canvas({ padding: 0.5 }) : undefined;

    for (const p of predios) {
      const prov = obtenerProvincia(p.provincia, p.codigo) || null;
      const asignados = getAsignados(p);
      const primaryAsignado = asignados[0] || "";
      const ventEstado: VentanaEstado = estadoVentana(p.fechaDesde, p.fechaHasta).estado;
      const color = colorBy === "provincia"
        ? getProvinciaColor(prov)
        : colorBy === "tecnico"
        ? getTecnicoColor(primaryAsignado, tecnicoColorMap)
        : colorBy === "ventana"
        ? VENTANA_COLORS[ventEstado]
        : (p.estado?.color || DEFAULT_PROVINCIA_COLOR);

      // Label inside marker depends on colorBy mode
      const label = colorBy === "tecnico"
        ? (primaryAsignado ? primaryAsignado[0].toUpperCase() : "")
        : (prov ? prov[0].toUpperCase() : "");

      const marker = usarCanvas
        ? L.circleMarker([p.latitud, p.longitud], {
            renderer: rendererCanvas,
            radius: 6,
            color: "#ffffff",
            weight: 1.5,
            fillColor: color,
            fillOpacity: 0.95,
          })
        : L.marker([p.latitud, p.longitud], { icon: createMarkerIcon(color, label) });

      const estadoLabel = p.estado
        ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${p.estado.color};margin-right:4px"></span>${p.estado.nombre}`
        : "Sin estado";

      // LAC-R: verde = SI (listo), rojo = NO. Indicador rápido para el técnico en campo.
      const lacRSi = (p.lacR || "").trim().toUpperCase() === "SI";
      const lacRColor = lacRSi ? "#10b981" : "#ef4444";
      const lacRLabel = lacRSi ? "SI" : "NO";
      const lacRRow = `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">LAC-R</td><td><span style="display:inline-flex;align-items:center;gap:5px;font-weight:700;color:${lacRColor}"><span style="width:9px;height:9px;border-radius:50%;background:${lacRColor};box-shadow:0 0 0 2px ${lacRColor}33"></span>${lacRLabel}</span></td></tr>`;

      const provColor = getProvinciaColor(prov);

      marker.bindPopup(
        `<div style="font-family:system-ui;font-size:12px;min-width:180px">
          <div style="font-weight:600;font-size:13px;margin-bottom:2px">${escapeHtml(p.nombre)}</div>
          <div style="color:#64748b;margin-bottom:6px;font-size:11px">${escapeHtml(p.codigo)}</div>
          ${prov ? `<div style="display:inline-flex;align-items:center;gap:4px;background:${provColor}15;border:1px solid ${provColor}40;color:${provColor};padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:600;margin-bottom:8px"><span style="width:6px;height:6px;border-radius:50%;background:${provColor}"></span>${escapeHtml(prov)}</div>` : ""}
          ${p.nombreInstitucion ? `<div style="font-size:11px;margin-bottom:6px"><span style="color:#94a3b8;font-weight:600">Colegio</span> <span style="color:#475569">${escapeHtml(p.nombreInstitucion)}</span></div>` : ""}
          <table style="width:100%;border-collapse:collapse">
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Estado</td><td>${estadoLabel}</td></tr>
            ${lacRRow}
            ${asignados.length > 0 ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Asignados</td><td>${escapeHtml(asignados.join(", "))}</td></tr>` : ""}
            ${p.ciudad ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Ciudad</td><td>${escapeHtml(p.ciudad)}</td></tr>` : ""}
            ${p.direccion ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Dirección</td><td style="display:flex;align-items:center;gap:4px"><span>${escapeHtml(p.direccion)}</span><button onclick="navigator.clipboard.writeText('${escapeHtml(p.direccion).replace(/'/g, "\\'")  }');this.textContent='✓';setTimeout(()=>this.textContent='📋',1200)" style="background:none;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:11px;padding:1px 4px;line-height:1;flex-shrink:0" title="Copiar dirección">📋</button></td></tr>` : ""}
            ${p.ambito ? `<tr><td style="color:#94a3b8;padding:2px 8px 2px 0">Ámbito</td><td>${escapeHtml(p.ambito)}</td></tr>` : ""}
            <tr><td style="color:#94a3b8;padding:2px 8px 2px 0">GPS</td><td style="display:flex;align-items:center;gap:4px"><span style="font-family:monospace;font-size:10px">${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)}</span><button onclick="navigator.clipboard.writeText('${p.latitud.toFixed(6)}, ${p.longitud.toFixed(6)}');this.textContent='✓';setTimeout(()=>this.textContent='📋',1200)" style="background:none;border:1px solid #cbd5e1;border-radius:4px;cursor:pointer;font-size:11px;padding:1px 4px;line-height:1" title="Copiar coordenadas">📋</button></td></tr>
          </table>
          <div style="margin-top:8px;padding-top:6px;border-top:1px solid #e2e8f0">
            <a href="${p.espacioId ? `/dashboard/tareas/espacio/${p.espacioId}/tareas?open=${encodeURIComponent(p.codigo)}` : `/dashboard/tareas?search=${encodeURIComponent(p.codigo)}&open=${encodeURIComponent(p.codigo)}`}" style="color:#6366f1;text-decoration:none;font-size:11px">Ver en tareas →</a>
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
