/**
 * Helpers del mapa de técnicos que NO dependen de Leaflet.
 *
 * Viven aparte a propósito: `MapaTecnicos.tsx` importa `leaflet`, que toca `window` al
 * cargarse. Si la página importara estos helpers desde ahí, Leaflet entraría al bundle
 * del servidor y el build se rompe con "window is not defined" — aunque el componente se
 * cargue con `dynamic({ ssr: false })`, porque un import estático se resuelve igual.
 */

export interface PredioAsignado {
  codigo: string | null;
  nombre: string;
  ciudad: string | null;
  estado: string | null;
  lat: number;
  lng: number;
  /** Metros hasta la última posición del técnico. Null si no tiene señal. */
  distanciaM: number | null;
}

export interface TecnicoUbicado {
  id: string;
  nombre: string;
  th: number | null;
  fotoUrl: string | null;
  ubicacion: {
    lat: number; lng: number; precision: number | null;
    origen: string; fecha: string; minutos: number;
  } | null;
  /** Puntos de hoy, del más viejo al más nuevo. */
  recorrido?: Array<{ lat: number; lng: number; fecha: string }>;
  /** Predios pendientes suyos, del más cercano al más lejano. */
  asignados?: PredioAsignado[];
}

/** "24 m", "5,6 km". Redondeo distinto por tramo: 5.634 m no aporta nada sobre 5,6 km. */
export function distanciaLegible(metros: number | null | undefined): string {
  if (metros == null) return "—";
  if (metros < 1000) return `${Math.round(metros)} m`;
  return `${(metros / 1000).toFixed(1).replace(".", ",")} km`;
}

/**
 * Qué tan cerca está del predio pendiente más próximo.
 *
 * Los cortes salen de lo que se ve en los datos: bajo 300 m el técnico está en el predio
 * (el GPS del celular tiene ese error), hasta 3 km está en la zona, y más allá está
 * trabajando en otra cosa o no está trabajando.
 */
export function cercania(metros: number | null | undefined): { texto: string; color: string } {
  if (metros == null) return { texto: "sin señal", color: "#94a3b8" };
  if (metros < 300) return { texto: "en el predio", color: "#059669" };
  if (metros < 3000) return { texto: "en la zona", color: "#d97706" };
  return { texto: "lejos", color: "#dc2626" };
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
