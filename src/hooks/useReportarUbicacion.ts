"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { dentroDeHorarioLaboral } from "@/lib/horarioLaboral";

/**
 * Reporta la ubicación del técnico mientras Carrot está abierto.
 *
 * LÍMITE IMPORTANTE: un navegador no puede reportar posición en segundo plano. Cuando
 * el técnico bloquea el teléfono o se cambia de app, esto deja de correr — y el service
 * worker no sirve de reemplazo porque la API de geolocalización no existe dentro de un
 * service worker. O sea que lo que se construye es "última ubicación conocida", no
 * rastreo continuo, y el mapa siempre muestra la antigüedad de la marca.
 *
 * Para aprovechar cada apertura de la app se reporta en tres momentos:
 *  - al montar (el técnico acaba de abrir Carrot),
 *  - cada 5 minutos mientras la pestaña está visible,
 *  - al volver a primer plano (`visibilitychange`), que es cuando vuelve del bloqueo.
 *
 * El filtro de "se movió poco / pasó poco tiempo" vive en el servidor: acá se manda y
 * allá se decide si vale la pena guardar. Así no hay dos reglas que se puedan desfasar.
 */

const INTERVALO_MS = 5 * 60 * 1000;

export interface EstadoReporte {
  activo: boolean;
  ultimoEnvio: Date | null;
  error: string | null;
}

export function useReportarUbicacion(habilitado: boolean): EstadoReporte {
  const [estado, setEstado] = useState<EstadoReporte>({ activo: false, ultimoEnvio: null, error: null });
  const enviando = useRef(false);

  const reportar = useCallback(async () => {
    if (!habilitado || enviando.current) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    // Chequeo local para no despertar el GPS fuera de hora; el servidor vuelve a validar.
    if (!dentroDeHorarioLaboral().dentro) {
      setEstado((p) => ({ ...p, activo: false }));
      return;
    }

    enviando.current = true;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const res = await fetch("/api/ubicacion", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              precision: pos.coords.accuracy,
              origen: "GPS",
            }),
          });
          if (res.ok) setEstado({ activo: true, ultimoEnvio: new Date(), error: null });
          else setEstado((p) => ({ ...p, activo: false }));
        } catch {
          setEstado((p) => ({ ...p, error: "Sin conexión" }));
        } finally {
          enviando.current = false;
        }
      },
      (err) => {
        enviando.current = false;
        setEstado({
          activo: false,
          ultimoEnvio: null,
          error: err.code === err.PERMISSION_DENIED ? "Permiso de ubicación denegado" : "No se pudo obtener la ubicación",
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }, [habilitado]);

  useEffect(() => {
    if (!habilitado) {
      setEstado({ activo: false, ultimoEnvio: null, error: null });
      return;
    }
    reportar();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") reportar();
    }, INTERVALO_MS);
    const alVolver = () => { if (document.visibilityState === "visible") reportar(); };
    document.addEventListener("visibilitychange", alVolver);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", alVolver);
    };
  }, [habilitado, reportar]);

  return estado;
}
