"use client";
import { useState } from "react";
import { normalizeReachability } from "@/utils/networkUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sprite PNG original de Meraki — usado como background-image con background-position
const MERAKI_PORT_SPRITE = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAFIAAAAmCAYAAABXn8xMAAAABmJLR0QA/wD/AP+gvaeTAAAACXBIWXMAAAsTAAALEwEAmpwYAAAAB3RJTUUH4AEEETIF6GxmfAAAAQJJREFUaN7tmtsNwyAMRZMqE7APHT7exyu0P60UUd6ECJpzP8GW4MhGss2qqq8FNWsLbRhjnr51Vd1LfUJ+OfYxm1GkqvuWuJw42/a7HwEqnjUbOUeOvVwAYzHG1PjYWERKYt2WHnSGyGpO7ZpLHn1i6X5VRI30RpZcVjLT9jZ6gACQgAQkAiQgAQlIBEhAAhL91tpn1cw9au/u9XxpC831WemQk9rjpXZr07XHWGDmUUNt87XHWGC6UQOpzRsJSEAiQAISkIBEgAQkINFHoX5kqrblv48P5PE3WW63JeMHWi54+beI9F1czorE0h+704N0+oC2IhJLYduTbJrEqGEQvQFrqmF3hSA1VgAAAABJRU5ErkJggg==';

// Colores Meraki extraídos de CSS
const MERAKI_GREEN = '#67b346';
const MERAKI_WARNING = '#b05f04';

// Background-positions del sprite por tipo de puerto (extraídas de CSS Meraki)
const SPRITE_POS = {
  rj45Arrow:    '0 0',          // Conectado sin PoE — flecha ↑
  rj45Poe:      '0 -19px',     // Conectado con PoE — rayo ⚡
  sfp:          '-18px -19px',  // Puerto SFP
  stack:        '-39px 0',      // Puerto Stack
} as const;

/**
 * Single Meraki switch port — sprite CSS + tooltip amarillo
 * Dimensiones y colores extraídos del CSS real de Meraki Dashboard
 */
const MerakiSwitchPort = ({ port, isUplink = false, isStackPort = false }: {
  port: any; isUplink?: boolean; isStackPort?: boolean;
}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const portStatus = (port.status || port.statusNormalized || '').toLowerCase();
  const isConnected = portStatus === 'connected' || portStatus === 'active';
  const hasPoe = port.poeEnabled === true;
  const hasWarnings = Array.isArray(port.warnings) && port.warnings.length > 0;
  const hasCrcError = hasWarnings && port.warnings.some((w: string) => /crc/i.test(w));
  const hasErrors = Array.isArray(port.errors) && port.errors.length > 0;
  const portName = port.name || '';
  const portNum = port.portId;
  const portType = port.type || 'trunk';
  const vlan = port.vlan || port.accessPolicyNumber || 1;

  const getSpeed = (): string => {
    if (!isConnected) return '';
    const v = port.speed || port.speedMbps || port.linkSpeed || port.speedLabel;
    if (!v) return '';
    if (typeof v === 'number') {
      if (v >= 10000) return '10 Gbps';
      if (v >= 1000) return '1 Gbps';
      if (v >= 100) return '100 Mbps';
      if (v >= 10) return '10 Mbps';
      return `${v} Mbps`;
    }
    const s = String(v).toLowerCase();
    if (s.includes('10000') || s.includes('10gbps') || s.includes('10 gbps')) return '10 Gbps';
    if (s.includes('1000') || s.includes('1gbps') || s.includes('1 gbps')) return '1 Gbps';
    if (s.includes('100')) return '100 Mbps';
    if (s.includes('10')) return '10 Mbps';
    return String(v);
  };

  const handleMouseEnter = (e: React.MouseEvent) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 10 });
    setShowTooltip(true);
  };

  // Determinar background-position del sprite según tipo y estado
  const getSpritePosition = (): string => {
    if (isStackPort) return SPRITE_POS.stack;
    if (isUplink) return SPRITE_POS.sfp;
    if (isConnected && hasPoe) return SPRITE_POS.rj45Poe;
    if (isConnected) return SPRITE_POS.rj45Arrow;
    return SPRITE_POS.rj45Arrow;
  };

  // Determinar background-color según estado
  const getBgColor = (): string => {
    if (hasCrcError) return MERAKI_WARNING;
    if (isConnected) return MERAKI_GREEN;
    return '#000';
  };

  // Dimensiones del puerto según tipo (extraídas del CSS Meraki)
  const portWidth = isStackPort ? 45 : 20;
  const portHeight = 21;

  return (
    <div
      style={{ position: 'relative', display: 'inline-block' }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div style={{
        width: `${portWidth}px`,
        height: `${portHeight}px`,
        backgroundColor: getBgColor(),
        backgroundImage: `url(${MERAKI_PORT_SPRITE})`,
        backgroundPosition: getSpritePosition(),
        border: '1px solid #000',
        cursor: 'pointer',
        boxSizing: 'border-box',
        display: 'inline-block',
        textAlign: 'center',
        verticalAlign: 'middle',
        position: 'relative',
      }}>
        {/* Ícono PoE (rayo amarillo) — SVG centrado absolutamente como FontAwesome de Meraki */}
        {isConnected && hasPoe && !hasCrcError && (
          <svg
            viewBox="0 0 320 512"
            width="10"
            height="14"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
              filter: 'drop-shadow(-1px 0 0 #000)',
            }}
          >
            <path d="M296 160H180.6l42.6-129.8C227.2 15 215.7 0 200 0H56C44 0 33.8 8.9 32.2 20.8l-32 240C-1.7 275.2 9.5 288 24 288h118.7L96.6 482.5c-3.6 15.2 8 29.5 23.3 29.5 8.4 0 16.4-4.4 20.8-12l176-304c9.3-15.9-2.2-36-20.7-36z" fill="#ff0" />
          </svg>
        )}
        {/* Ícono CRC warning — SVG centrado absolutamente */}
        {hasCrcError && (
          <svg
            viewBox="0 0 10 14"
            width="10"
            height="14"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1,
            }}
          >
            <text x="5" y="12" textAnchor="middle" fontSize="13" fontWeight="bold" fill="#fff">!</text>
          </svg>
        )}
      </div>
      {showTooltip && (
        <div style={{
          position: 'fixed', left: tooltipPos.x, top: tooltipPos.y,
          transform: 'translate(-50%, -100%)',
          background: '#fffde7', border: '1px solid #fbc02d', borderRadius: '3px',
          padding: '8px 13px', fontSize: '13px', color: '#222',
          whiteSpace: 'nowrap', zIndex: 9999,
          boxShadow: '0 3px 9px rgba(0,0,0,0.18)', pointerEvents: 'none',
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
        }}>
          <div style={{ fontWeight: 600, marginBottom: '3px' }}>
            {isStackPort ? `Stack port ${portNum}` : isUplink ? `SFP port ${portNum}` : `Port ${portNum}`}
            {portName && ` : ${portName}`}
          </div>
          <div style={{ color: isConnected ? '#67b346' : '#666' }}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </div>
          {hasCrcError && <div style={{ color: '#e8960c', fontWeight: 600 }}>CRC errors detected</div>}
          {hasWarnings && !hasCrcError && port.warnings.map((w: string, i: number) => (
            <div key={i} style={{ color: '#e8960c' }}>{w}</div>
          ))}
          {hasErrors && port.errors.map((e: string, i: number) => (
            <div key={i} style={{ color: '#d32f2f' }}>{e}</div>
          ))}
          <div style={{ color: '#666' }}>Auto negotiate{isConnected && getSpeed() ? ` (${getSpeed()})` : ''}</div>
          <div style={{ color: '#666' }}>{portType === 'trunk' ? `Trunk: native VLAN ${vlan}` : `Access: VLAN ${vlan}`}</div>
          {hasPoe && <div style={{ color: '#67b346' }}>PoE enabled</div>}
        </div>
      )}
    </div>
  );
};

/**
 * Grid de puertos de un switch — Estilo Meraki exacto
 * border-spacing: 2px, dimensiones 20×21px, sprite PNG con background-position
 */
export const SwitchPortsGrid = ({ ports = [] }: { ports: any[] }) => {
  if (!ports.length) return <div style={{ fontSize: 13, color: "#64748b" }}>Sin información de puertos disponible.</div>;

  const regularPorts = ports.filter((p) => { const n = parseInt(p.portId); return n >= 1 && n <= 24; }).sort((a, b) => parseInt(a.portId) - parseInt(b.portId));
  const sfpPorts = ports.filter((p) => { const n = parseInt(p.portId); return n >= 25 && n <= 28; }).sort((a, b) => parseInt(a.portId) - parseInt(b.portId));
  const stackPorts = ports.filter((p) => parseInt(p.portId) > 28 || p.isStackPort).sort((a, b) => parseInt(a.portId) - parseInt(b.portId));

  const oddPorts = regularPorts.filter((p) => parseInt(p.portId) % 2 === 1);
  const evenPorts = regularPorts.filter((p) => parseInt(p.portId) % 2 === 0);

  // Estilo de números de puerto — exacto de Meraki
  const numStyle: React.CSSProperties = {
    textAlign: 'center', fontSize: '11px', color: '#000',
    fontWeight: 400, padding: 0, fontFamily: 'Inter, arial, sans-serif',
  };

  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: '10px',
      background: '#ebebeb', padding: '4px', whiteSpace: 'nowrap',
      fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif',
      borderRadius: '4px',
    }}>
      {/* RJ45 ports (1-24): border-spacing 2px como en Meraki */}
      <table style={{ borderCollapse: 'initial', borderSpacing: '2px', tableLayout: 'auto', width: 'auto', margin: 0 }}>
        <tbody>
          <tr>
            {oddPorts.map((p) => (
              <td key={`num-top-${p.portId}`} style={{ ...numStyle, verticalAlign: 'bottom', height: '16px' }}>
                {p.portId}
              </td>
            ))}
          </tr>
          <tr>
            {oddPorts.map((p) => (
              <td key={`port-${p.portId}`} style={{ padding: 0, verticalAlign: 'top' }}>
                <MerakiSwitchPort port={p} />
              </td>
            ))}
          </tr>
          <tr>
            {evenPorts.map((p) => (
              <td key={`port-${p.portId}`} style={{ padding: 0, verticalAlign: 'top' }}>
                <MerakiSwitchPort port={p} />
              </td>
            ))}
          </tr>
          <tr>
            {evenPorts.map((p) => (
              <td key={`num-bottom-${p.portId}`} style={{ ...numStyle, verticalAlign: 'top', height: '16px' }}>
                {p.portId}
              </td>
            ))}
          </tr>
        </tbody>
      </table>

      {/* SFP ports (25-28) */}
      {sfpPorts.length > 0 && (
        <table style={{ borderCollapse: 'initial', borderSpacing: '2px', tableLayout: 'auto', width: 'auto', margin: 0 }}>
          <tbody>
            <tr>
              {sfpPorts.map((p) => (
                <td key={`sfp-num-${p.portId}`} style={{ ...numStyle, verticalAlign: 'bottom', height: '16px' }}>
                  {p.portId}
                </td>
              ))}
            </tr>
            <tr>
              {sfpPorts.map((p) => (
                <td key={`sfp-port-${p.portId}`} style={{ padding: 0, verticalAlign: 'top' }}>
                  <MerakiSwitchPort port={p} isUplink={true} />
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}

      {/* Stack ports (>28) */}
      {stackPorts.length > 0 && (
        <table style={{ borderCollapse: 'initial', borderSpacing: '2px', tableLayout: 'auto', width: 'auto', margin: 0 }}>
          <tbody>
            <tr>
              {stackPorts.map((p) => (
                <td key={`stack-${p.portId}`} style={{ padding: 0, textAlign: 'center' }}>
                  <MerakiSwitchPort port={p} isStackPort={true} />
                  <div style={{ fontSize: '11px', color: '#000', marginTop: '2px' }}>{p.portId}</div>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      )}
    </div>
  );
};

/**
 * Card de switch — dark theme con stats grid, banner CRC y grilla de puertos
 */
export const SwitchCard = ({ sw }: { sw: any }) => {
  const portsToShow: any[] = Array.isArray(sw.ports) ? sw.ports : [];
  const statusColor = normalizeReachability(sw.status) === 'connected' ? '#67b346' : '#ef4444';

  const activePorts = portsToShow.filter((p: any) => (p.status || '').toLowerCase() === 'connected');
  const inactivePorts = portsToShow.filter((p: any) => (p.status || '').toLowerCase() !== 'connected');
  const poePorts = portsToShow.filter((p: any) => p.poeEnabled);
  const crcCount: number = sw.crcErrorPorts != null
    ? sw.crcErrorPorts
    : portsToShow.filter((p: any) => Array.isArray(p.warnings) && p.warnings.some((w: string) => /crc/i.test(w))).length;

  return (
    <div style={{ background: '#1e293b', borderRadius: 8, padding: 16, border: '1px solid #334155', marginBottom: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ color: '#f1f5f9', fontWeight: 600, fontSize: 15 }}>{sw.name || sw.serial}</span>
        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: statusColor }} />
        <span style={{ color: statusColor, fontSize: 12 }}>{sw.status}</span>
        {crcCount > 0 && (
          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #f59e0b', borderRadius: '9999px', padding: '1px 8px', fontSize: 11, fontWeight: 700, marginLeft: 'auto' }}>
            {crcCount} CRC
          </span>
        )}
      </div>

      {/* Banner CRC */}
      {crcCount > 0 && (
        <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: 6, padding: '6px 12px', marginBottom: 10, color: '#92400e', fontSize: 13 }}>
          Este switch tiene <strong>{crcCount}</strong> puerto{crcCount > 1 ? 's' : ''} con errores CRC
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6, marginBottom: 12, textAlign: 'center' }}>
        {[
          { label: 'Total', value: portsToShow.length },
          { label: 'Activos', value: activePorts.length },
          { label: 'Inactivos', value: inactivePorts.length },
          { label: 'PoE', value: poePorts.length },
          { label: 'CRC', value: crcCount },
        ].map(({ label, value }) => (
          <div key={label} style={{ background: '#0f172a', borderRadius: 6, padding: '6px 4px' }}>
            <div style={{ color: '#94a3b8', fontSize: 10 }}>{label}</div>
            <div style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 14 }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Grilla de puertos */}
      <SwitchPortsGrid ports={portsToShow} />
    </div>
  );
};
