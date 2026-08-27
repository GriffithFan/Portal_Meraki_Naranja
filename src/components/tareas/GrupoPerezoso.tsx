"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Retrasa el montaje de un grupo hasta que estás por llegar a él. Una vez montado, se
 * queda: no existe camino de vuelta.
 *
 * Para qué sirve: hay un virtualizador POR GRUPO, y cada uno mantiene sus filas en el DOM.
 * Con 13 grupos abiertos son ~270 filas para una ventana que muestra 15, y el costo no es
 * dibujarlas sino que el navegador recalcule el estilo de todo ese árbol en cada cambio.
 * Al abrir la pantalla solo se arman los grupos que se ven; el resto espera a que llegues.
 *
 * POR QUÉ NO SE DESMONTA. La primera versión sí lo hacía, dejando un hueco del alto del
 * grupo, y provocó un bug feo: al llegar al final de un estado el scroll te devolvía al
 * principio de la lista y no te dejaba seguir bajando.
 *
 * La causa no fue una sola cosa, y por eso costó. Un grupo montado NO tiene un alto fijo:
 * su virtualizador arranca estimando el alto de las filas y lo va corrigiendo a medida que
 * mide las reales, así que el grupo crece y se achica mientras lo recorrés. Cualquier alto
 * que se guarde para el hueco es una foto de un instante — probé con
 * `entry.boundingClientRect`, con un `ResizeObserver` y midiendo justo antes de desmontar,
 * y las tres dejaban el hueco corto. Y con el hueco corto la página se encoge al bajar, el
 * navegador te recorta el scroll al nuevo máximo, ese recorte vuelve a acercar un grupo que
 * se había ido, que se monta y cambia el alto otra vez: un vaivén que te va empujando para
 * arriba. Eso es exactamente lo que se sentía como "llego al final y me tira al inicio".
 *
 * Montar y no soltar corta el problema de raíz: la página solo puede crecer, así que el
 * navegador nunca tiene motivo para recortar el scroll. Se conserva casi todo el beneficio
 * —lo caro es abrir la pantalla con todos los grupos armados— y el DOM crece solo con los
 * grupos que de verdad visitaste.
 */
export default function GrupoPerezoso({
  children,
  altoEstimado,
}: {
  children: React.ReactNode;
  /** Alto aproximado del grupo, para reservar el lugar antes de armarlo. */
  altoEstimado: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Arranca sin montar y solo se monta hacia adelante. Que NO exista un camino de vuelta
  // es lo importante: en la version anterior habia una rama que desmontaba los grupos que
  // nunca llegaste a ver, y el hueco de esos vale `items.length * alto`, o sea CERO para
  // un grupo que todavia no cargo sus datos. Varios grupos cayendo a cero de golpe
  // desploman el contenido y el navegador manda el scroll al principio: medido, un salto
  // de 9.961 px a 0 en la lista general con seis estados abiertos.
  const [montado, setMontado] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entrada]) => {
        if (!entrada.isIntersecting) return; // nunca se vuelve atras
        setMontado(true);
        io.disconnect(); // ya está: no hay nada más que vigilar
      },
      { rootMargin: "900px 0px" }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} style={montado ? undefined : { height: Math.max(altoEstimado, 60) }}>
      {montado ? children : null}
    </div>
  );
}
