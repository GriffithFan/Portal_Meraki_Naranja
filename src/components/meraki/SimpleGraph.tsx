"use client";
import { useMemo } from "react";
import { buildLayout, buildLinkPath, statusColorOf, computeNodeLabels } from "./SimpleGraphUtils";

/* eslint-disable @typescript-eslint/no-explicit-any */

function NodeShape({ node, fill, scaleFactor = 1.0 }: { node: any; fill: string; scaleFactor?: number }) {
  const baseStroke = "#ecf0f1";
  const scale = (size: number) => Math.round(size * scaleFactor);

  if (node.kind === "external") {
    const size = scale(20); const half = size / 2;
    return <rect x={-half} y={-half} width={size} height={size} transform="rotate(45)" fill="#fff" stroke={fill} strokeWidth={2.5} rx={2} ry={2} />;
  }
  if (node.kind === "appliance" || node.kind === "gateway") return <rect x={-scale(20)} y={-scale(12)} width={scale(40)} height={scale(24)} rx={4} ry={4} fill={fill} stroke={baseStroke} strokeWidth={1.5} />;
  if (node.kind === "switch" || node.kind === "bridge") return <rect x={-scale(24)} y={-scale(14)} width={scale(48)} height={scale(28)} rx={5} ry={5} fill={fill} stroke={baseStroke} strokeWidth={1.5} />;
  if (node.kind === "camera") return <rect x={-scale(16)} y={-scale(11)} width={scale(32)} height={scale(22)} rx={11} ry={11} fill={fill} stroke={baseStroke} strokeWidth={1.5} />;
  if (node.kind === "sensor") { const points = `0,${-scale(16)} ${scale(14)},0 0,${scale(16)} ${-scale(14)},0`; return <polygon points={points} fill={fill} stroke={baseStroke} strokeWidth={1.5} />; }
  return <circle r={scale(14)} fill={fill} stroke={baseStroke} strokeWidth={1.5} />;
}

export default function SimpleGraph({ graph, devices = [] }: { graph: any; devices?: any[] }) {
  const deviceMap = useMemo(() => {
    const map = new Map<string, any>();
    devices.forEach((d) => { if (!d?.serial) return; const s = d.serial.toString(); map.set(s, d); map.set(s.toUpperCase(), d); });
    return map;
  }, [devices]);

  const layout = useMemo(() => buildLayout(graph, deviceMap), [graph, deviceMap]);
  if (!layout.nodes.length) return null;
  const { apCount = 0 } = layout;
  const viewBox = `${layout.viewBoxX || 0} ${layout.viewBoxY || 0} ${layout.width} ${layout.height}`;
  const baseScale = layout.scaleFactor || 1.0;

  // Label positioning based on AP count
  const labelConfig = (count: number) => {
    if (count <= 4) return { py: -76, sy: -48, ty: -24, pf: 20, sf: 16, tf: 16 };
    if (count <= 6) return { py: -84, sy: -52, ty: -28, pf: 20, sf: 16, tf: 16 };
    if (count <= 8) return { py: -60, sy: -35, ty: -10, pf: 20, sf: 16, tf: 16 };
    if (count <= 12) return { py: -65, sy: -40, ty: -15, pf: 20, sf: 16, tf: 16 };
    if (count <= 20) return { py: -70, sy: -45, ty: -20, pf: 21, sf: 17, tf: 17 };
    if (count <= 30) return { py: -85, sy: -55, ty: -25, pf: 22, sf: 18, tf: 18 };
    if (count <= 40) return { py: -95, sy: -65, ty: -35, pf: 23, sf: 19, tf: 19 };
    if (count <= 60) return { py: -110, sy: -75, ty: -40, pf: 23, sf: 19, tf: 19 };
    return { py: -125, sy: -90, ty: -55, pf: 24, sf: 20, tf: 20 };
  };

  const lc = labelConfig(apCount);
  let primaryFontSize = Math.round(lc.pf * baseScale);
  let secondaryFontSize = Math.round(lc.sf * baseScale);
  let tertiaryFontSize = Math.round(lc.tf * baseScale);
  if (apCount <= 6) { primaryFontSize = Math.max(10, primaryFontSize - 1); secondaryFontSize = Math.max(10, secondaryFontSize - 1); tertiaryFontSize = Math.max(10, tertiaryFontSize - 1); }

  return (
    <svg width="100%" height="auto" viewBox={viewBox} preserveAspectRatio="xMidYMin meet" style={{ display: "block", maxHeight: `${layout.height}px` }}>
      <g fill="none" stroke="#cfd8dc" strokeWidth="2" strokeLinecap="round">
        {layout.links.map(({ source, target }: any) => <path key={`${source.id}-${target.id}`} d={buildLinkPath(source, target)} />)}
      </g>
      {layout.nodes.map((node: any) => {
        const color = statusColorOf(node.status);
        const isExternal = node.kind === "external";
        const iconScale = apCount === 1 ? baseScale * 1.25 : baseScale;
        let textAnchor: "start" | "middle" | "end" = "middle";
        let labelX = 0;
        let primaryY = lc.py, secondaryY = lc.sy, tertiaryY = lc.ty;

        if (isExternal) {
          textAnchor = "end"; labelX = -28;
          primaryY = -8; secondaryY = primaryY + 16; tertiaryY = secondaryY + 16;
        }

        const { primary, secondary, tertiary } = computeNodeLabels(node);
        const showPrimary = !isExternal && Boolean(primary);
        const showSecondary = !isExternal && Boolean(secondary);
        const showTertiary = !isExternal && Boolean(tertiary);
        const titleParts = [primary, secondary, tertiary, node.status].filter(Boolean);

        return (
          <g key={node.id} transform={`translate(${node.x},${node.y})`}>
            <NodeShape node={node} fill={color} scaleFactor={iconScale} />
            {showPrimary && <text x={labelX} y={primaryY} fontSize={primaryFontSize} fontWeight="500" fill="#1e293b" textAnchor={textAnchor}>{primary}</text>}
            {showSecondary && <text x={labelX} y={secondaryY} fontSize={secondaryFontSize} fontWeight="400" fill="#475569" textAnchor={textAnchor}>{secondary}</text>}
            {showTertiary && <text x={labelX} y={tertiaryY} fontSize={tertiaryFontSize} fontWeight="400" fill="#64748b" textAnchor={textAnchor}>{tertiary}</text>}
            <title>{titleParts.length ? titleParts.join("\n") : node.status || "unknown"}</title>
          </g>
        );
      })}
    </svg>
  );
}
