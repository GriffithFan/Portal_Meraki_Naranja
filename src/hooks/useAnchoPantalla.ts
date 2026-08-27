"use client";

import { useEffect, useState } from "react";

/** Breakpoint `md` de Tailwind: abajo de esto se usa la vista de celular. */
const MD = 768;

/**
 * ¿Estamos en pantalla de celular? Sirve para NO CONSTRUIR el marcado que no se ve.
 *
 * El problema que resuelve: las pantallas de tareas dibujan dos versiones de cada fila
 * —una lista para celular con `md:hidden` y una tabla con `hidden md:table`— y CSS oculta
 * la que no corresponde. Pero ocultar con CSS no evita construirla: el navegador arma,
 * estila y mide igual las dos. En la carpeta "Predios 2026" eso eran 73.545 nodos de DOM
 * y 5,5 segundos de hilo bloqueado, con la mitad del trabajo tirado a la basura.
 *
 * Devuelve `null` hasta que el componente monta, a proposito: durante el render del
 * servidor no hay `matchMedia`, y si adivinaramos un valor la hidratacion no coincidiria.
 * Con `null` se dibujan las dos como siempre —igual que ahora— y en cuanto monta se deja
 * solo la que corresponde. Quien lo use debe tratar `null` como "todavia no se sabe".
 */
export function useEsPantallaChica(): boolean | null {
  const [esChica, setEsChica] = useState<boolean | null>(null);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(`(max-width: ${MD - 1}px)`);
    const aplicar = () => setEsChica(mq.matches);
    aplicar();
    mq.addEventListener("change", aplicar);
    return () => mq.removeEventListener("change", aplicar);
  }, []);

  return esChica;
}
