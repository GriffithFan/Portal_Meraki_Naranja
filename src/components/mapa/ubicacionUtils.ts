/**
 * Helpers del mapa de técnicos que NO dependen de Leaflet.
 *
 * Viven aparte a propósito: `MapaTecnicos.tsx` importa `leaflet`, que toca `window` al
 * cargarse. Si la página importara estos helpers desde ahí, Leaflet entraría al bundle
 * del servidor y el build se rompe con "window is not defined" — aunque el componente se
 * cargue con `dynamic({ ssr: false })`, porque un import estático se resuelve igual.
 */

export interface TecnicoUbicado {
  id: string;
  nombre: string;
  th: number | null;
  fotoUrl: string | null;
  ubicacion: {
    lat: number; lng: number; precision: number | null;
    origen: string; fecha: string; minutos: number;
  } | null;
}

/**
 * Color según la antigüedad de la señal.
 *
 * Es la información más importante del mapa, no un adorno: como el navegador no puede
 * reportar en segundo plano, una marca puede tener horas. El color dice de un vistazo si
 * el punto sirve para decidir algo ahora o si ya es historia.
 */
export function colorPorEdad(minutos: number): string {
  if (minutos <= 15) return "#059669";   // verde: recién
  if (minutos <= 60) return "#d97706";   // ámbar: hace un rato
  return "#dc2626";                       // rojo: viejo
}

export function edadLegible(minutos: number): string {
  if (minutos < 1) return "recién";
  if (minutos < 60) return `hace ${minutos} min`;
  const h = Math.floor(minutos / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** Iniciales para el marcador cuando la ficha no está vinculada o no tiene foto. */
export function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
