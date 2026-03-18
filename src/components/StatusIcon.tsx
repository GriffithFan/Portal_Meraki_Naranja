"use client";

/**
 * StatusIcon — Renders ClickUp-style status icons based on estado clave.
 * Each status has a unique SVG shape + color to match ClickUp's visual system.
 */

interface StatusIconProps {
  clave?: string;
  color: string;
  size?: number;
  className?: string;
}

export default function StatusIcon({ clave, color, size = 14, className = "" }: StatusIconProps) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const outerR = r - 1;
  const innerR = outerR * 0.35;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={`flex-shrink-0 ${className}`}
      fill="none"
    >
      {(() => {
        switch (clave) {
          // ── Abiertos ──

          // SIN ASIGNAR: círculo gris con borde punteado
          case "sin_asignar":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} strokeDasharray="2 2" fill="none" />
                <circle cx={cx} cy={cy} r={innerR} fill={color} />
              </>
            );

          // BLOCKEADO: círculo con línea diagonal (bloqueado)
          case "blockeado":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill="none" />
                <line x1={cx - outerR * 0.5} y1={cy - outerR * 0.5} x2={cx + outerR * 0.5} y2={cy + outerR * 0.5} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
              </>
            );

          // RELEVAR: círculo con cuarto relleno (progreso parcial)
          case "relevar":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill="none" />
                <path
                  d={`M${cx},${cy} L${cx},${cy - outerR} A${outerR},${outerR} 0 0,1 ${cx + outerR},${cy} Z`}
                  fill={color}
                  opacity={0.8}
                />
              </>
            );

          // RELEVADO: círculo medio relleno
          case "relevado":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill="none" />
                <path
                  d={`M${cx},${cy - outerR} A${outerR},${outerR} 0 1,1 ${cx},${cy + outerR} Z`}
                  fill={color}
                  opacity={0.8}
                />
              </>
            );

          // CAMBIO LAC: círculo con signo de exclamación
          case "cambio_lac":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill={`${color}20`} />
                <line x1={cx} y1={cy - outerR * 0.45} x2={cx} y2={cy + outerR * 0.1} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
                <circle cx={cx} cy={cy + outerR * 0.45} r={0.8} fill={color} />
              </>
            );

          // EN PROGRESO: 3/4 del círculo relleno
          case "en_progreso":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill="none" />
                <path
                  d={`M${cx},${cy} L${cx},${cy - outerR} A${outerR},${outerR} 0 1,1 ${cx - outerR},${cy} Z`}
                  fill={color}
                  opacity={0.8}
                />
              </>
            );

          // INSTALADO: círculo completamente relleno
          case "instalado":
            return (
              <circle cx={cx} cy={cy} r={outerR} fill={color} stroke={color} strokeWidth={0.5} />
            );

          // AUDITAR: circulo con ojo/lupa
          case "auditar":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill="none" />
                <circle cx={cx} cy={cy} r={innerR + 0.5} stroke={color} strokeWidth={1.2} fill="none" />
                <circle cx={cx} cy={cy} r={1} fill={color} />
              </>
            );

          // NO CONFORME: círculo con X
          case "no_conforme":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill={`${color}15`} />
                <line x1={cx - outerR * 0.35} y1={cy - outerR * 0.35} x2={cx + outerR * 0.35} y2={cy + outerR * 0.35} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
                <line x1={cx + outerR * 0.35} y1={cy - outerR * 0.35} x2={cx - outerR * 0.35} y2={cy + outerR * 0.35} stroke={color} strokeWidth={1.5} strokeLinecap="round" />
              </>
            );

          // NO APTO: círculo con menos/dash
          case "no_apto":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} stroke={color} strokeWidth={1.5} fill={`${color}15`} />
                <line x1={cx - outerR * 0.4} y1={cy} x2={cx + outerR * 0.4} y2={cy} stroke={color} strokeWidth={1.8} strokeLinecap="round" />
              </>
            );

          // ── Done ──

          // CONFORME: círculo con checkmark
          case "conforme":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} fill={color} />
                <polyline
                  points={`${cx - outerR * 0.35},${cy} ${cx - outerR * 0.05},${cy + outerR * 0.35} ${cx + outerR * 0.4},${cy - outerR * 0.25}`}
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </>
            );

          // ── Closed ──

          // CERRADO: círculo verde con checkmark doble
          case "cerrado":
            return (
              <>
                <circle cx={cx} cy={cy} r={outerR} fill={color} />
                <polyline
                  points={`${cx - outerR * 0.35},${cy} ${cx - outerR * 0.05},${cy + outerR * 0.35} ${cx + outerR * 0.4},${cy - outerR * 0.25}`}
                  stroke="white"
                  strokeWidth={1.5}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill="none"
                />
              </>
            );

          // Fallback: simple dot
          default:
            return <circle cx={cx} cy={cy} r={outerR} fill={color} />;
        }
      })()}
    </svg>
  );
}
