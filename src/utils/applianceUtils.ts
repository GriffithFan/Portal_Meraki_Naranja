import type { MerakiAppliancePortStatus, TopologyResponse, TopologyNode, TopologyLink } from "@/types/meraki";

/**
 * Agrupa puertos del appliance por rol (WAN/LAN)
 */
export const groupPortsByRole = (ports: MerakiAppliancePortStatus[] = []): Map<string, MerakiAppliancePortStatus[]> => {
  const groups = new Map<string, MerakiAppliancePortStatus[]>();
  ports.forEach((port) => {
    const role = (port.role || port.type || "LAN").toLowerCase();
    if (!groups.has(role)) groups.set(role, []);
    groups.get(role)!.push(port);
  });
  return groups;
};

/**
 * Deriva puertos conectados desde la topología
 * Solo incluye puertos que además figuran en `ports` con carrier/speed activo,
 * para evitar falsos positivos de links obsoletos en la topología.
 */
export const deriveConnectedPortsFromTopology = (applianceSerial: string, topology: TopologyResponse, ports: MerakiAppliancePortStatus[] = []): number[] => {
  if (!applianceSerial || !topology) return [];
  const nodes: TopologyNode[] = Array.isArray(topology.nodes) ? topology.nodes : [];
  const links: TopologyLink[] = Array.isArray(topology.links) ? topology.links : [];
  const applianceNode = nodes.find((n) => n.serial === applianceSerial);
  if (!applianceNode) return [];

  // Puertos que realmente tienen carrier según el status de la API
  const portsWithCarrier = new Set<number>();
  ports.forEach((p) => {
    const num = typeof p.number === "string" ? parseInt(p.number, 10) : (p.number ?? 0);
    const status = ((p as any).status || "").toLowerCase();
    const hasSpeed = typeof (p as any).speed === "number" && (p as any).speed > 0;
    const hasCarrier = (p as any).hasCarrier === true;
    const isConnected = /(connected|active|up|ready)/.test(status) || hasSpeed || hasCarrier;
    if (isConnected) portsWithCarrier.add(num);
  });

  const connectedPorts = new Set<number>();
  links.forEach((link) => {
    if (link.source === applianceNode.id && link.sourcePort) {
      const portNum = parseInt(link.sourcePort, 10);
      if (Number.isFinite(portNum)) connectedPorts.add(portNum);
    }
    if (link.target === applianceNode.id && link.targetPort) {
      const portNum = parseInt(link.targetPort, 10);
      if (Number.isFinite(portNum)) connectedPorts.add(portNum);
    }
  });

  // Si tenemos datos de puertos, filtrar solo los que realmente tienen carrier
  if (ports.length > 0) {
    return Array.from(connectedPorts).filter((p) => portsWithCarrier.has(p)).sort((a, b) => a - b);
  }
  return Array.from(connectedPorts).sort((a, b) => a - b);
};

/**
 * Enriquece puertos con información de conexiones desde topología
 */
export const enrichPortsWithConnections = (ports: MerakiAppliancePortStatus[], applianceSerial: string, topology: TopologyResponse): MerakiAppliancePortStatus[] => {
  if (!ports || !Array.isArray(ports)) return [];
  if (!applianceSerial || !topology) return ports;
  const nodes: TopologyNode[] = Array.isArray(topology.nodes) ? topology.nodes : [];
  const links: TopologyLink[] = Array.isArray(topology.links) ? topology.links : [];
  const applianceNode = nodes.find((n) => n.serial === applianceSerial);
  if (!applianceNode) return ports;

  const portConnections = new Map<number, { deviceName: string; deviceSerial: string; deviceType: string }>();
  links.forEach((link) => {
    if (link.source === applianceNode.id && link.sourcePort) {
      const portNum = parseInt(link.sourcePort, 10);
      if (Number.isFinite(portNum)) {
        const targetNode = nodes.find((n) => n.id === link.target);
        if (targetNode) {
          portConnections.set(portNum, {
            deviceName: targetNode.label || targetNode.name || targetNode.serial || "unknown",
            deviceSerial: targetNode.serial || "",
            deviceType: targetNode.type || "unknown",
          });
        }
      }
    }
    if (link.target === applianceNode.id && link.targetPort) {
      const portNum = parseInt(link.targetPort, 10);
      if (Number.isFinite(portNum)) {
        const sourceNode = nodes.find((n) => n.id === link.source);
        if (sourceNode) {
          portConnections.set(portNum, {
            deviceName: sourceNode.label || sourceNode.name || sourceNode.serial || "unknown",
            deviceSerial: sourceNode.serial || "",
            deviceType: sourceNode.type || "unknown",
          });
        }
      }
    }
  });

  return ports.map((port) => {
    const portNum = typeof port.number === "string" ? parseInt(port.number, 10) : (port.number ?? 0);
    const connection = portConnections.get(portNum);
    return { ...port, connection: connection || null, hasTopologyConnection: !!connection };
  });
};
