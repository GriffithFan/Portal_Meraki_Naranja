"use client";

import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { colorPorEdad, edadLegible, iniciales, type TecnicoUbicado } from "./ubicacionUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface Props {
  tecnicos: TecnicoUbicado[];
  seleccionado: string | null;
  onSeleccionar: (id: string | null) => void;
}

function iconoTecnico(t: TecnicoUbicado, activo: boolean): L.DivIcon {
  const min = t.ubicacion?.minutos ?? 9999;
  const color = colorPorEdad(min);
  const size = activo ? 52 : 42;
  const interior = t.fotoUrl
    ? `<img src="${t.fotoUrl}" alt="" style="width:100%;height:100%;object-fit:cover;display:block"/>`
    : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;
         background:#334155;color:#fff;font-size:${activo ? 16 : 13}px;font-weight:600;
         font-family:system-ui,sans-serif">${iniciales(t.nombre)}</div>`;

  return L.divIcon({
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;overflow:hidden;
        border:3px solid ${color};box-shadow:0 2px 8px rgba(0,0,0,.35);background:#fff;
        ${activo ? "outline:3px solid rgba(255,255,255,.9);" : ""}">${interior}</div>`,
  });
}

export default function MapaTecnicos({ tecnicos, seleccionado, onSeleccionar }: Props) {
  const contenedorRef = useRef<HTMLDivElement>(null);
  const mapaRef = useRef<L.Map | null>(null);
  const capaRef = useRef<L.LayerGroup | null>(null);
  const yaEncuadro = useRef(false);

  const conUbicacion = useMemo(() => tecnicos.filter((t) => t.ubicacion), [tecnicos]);

  useEffect(() => {
    if (!contenedorRef.current || mapaRef.current) return;
    const mapa = L.map(contenedorRef.current, { center: [-34.6, -58.4], zoom: 6, zoomControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(mapa);
    capaRef.current = L.layerGroup().addTo(mapa);
    mapaRef.current = mapa;
    // Al hacer clic en el mapa vacío se deselecciona.
    mapa.on("click", () => onSeleccionar(null));
    return () => { mapa.remove(); mapaRef.current = null; };
  }, [onSeleccionar]);

  // Marcadores
  useEffect(() => {
    const capa = capaRef.current;
    if (!capa) return;
    capa.clearLayers();

    for (const t of conUbicacion) {
      const u = t.ubicacion!;
      const activo = seleccionado === t.id;

      if (u.precision && u.precision > 40) {
        L.circle([u.lat, u.lng], {
          radius: u.precision,
          color: colorPorEdad(u.minutos),
          weight: 1,
          fillOpacity: 0.08,
        }).addTo(capa);
      }

      L.marker([u.lat, u.lng], { icon: iconoTecnico(t, activo), zIndexOffset: activo ? 1000 : 0 })
        .on("click", (e) => { L.DomEvent.stopPropagation(e as any); onSeleccionar(t.id); })
        .bindTooltip(`${t.nombre} · ${edadLegible(u.minutos)}`, { direction: "top", offset: [0, -24] })
        .addTo(capa);
    }
  }, [conUbicacion, seleccionado, onSeleccionar]);

  // Encuadre inicial: una sola vez, para no pelearle el zoom al usuario en cada refresco.
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || yaEncuadro.current || conUbicacion.length === 0) return;
    const puntos = conUbicacion.map((t) => [t.ubicacion!.lat, t.ubicacion!.lng] as [number, number]);
    mapa.fitBounds(L.latLngBounds(puntos).pad(0.25), { maxZoom: 13 });
    yaEncuadro.current = true;
  }, [conUbicacion]);

  // Centrar en el seleccionado
  useEffect(() => {
    const mapa = mapaRef.current;
    if (!mapa || !seleccionado) return;
    const t = conUbicacion.find((x) => x.id === seleccionado);
    if (t?.ubicacion) mapa.panTo([t.ubicacion.lat, t.ubicacion.lng], { animate: true });
  }, [seleccionado, conUbicacion]);

  return <div ref={contenedorRef} className="h-full w-full rounded-lg" />;
}
