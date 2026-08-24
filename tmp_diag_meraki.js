// READ-ONLY: diagnostica por qué el monitoreo Meraki no encuentra redes.
const fs = require("fs");
const { PrismaClient } = require("/var/www/carrot/node_modules/.prisma/client");
const p = new PrismaClient();

(async () => {
  try {
    // 1. ENV
    const env = {};
    try {
      for (const line of fs.readFileSync("/var/www/carrot/.env", "utf8").split("\n")) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    } catch (e) { console.log("No pude leer .env:", e.message); }
    const key = env.MERAKI_API_KEY || process.env.MERAKI_API_KEY || "";
    const base = env.MERAKI_BASE_URL || "https://api.meraki.com/api/v1";
    console.log("MERAKI_API_KEY:", key ? `present (len ${key.length}, …${key.slice(-4)})` : "❌ MISSING");
    console.log("MERAKI_ORG_ID:", env.MERAKI_ORG_ID || "(none)");
    console.log("MERAKI_BASE_URL:", env.MERAKI_BASE_URL || "(default api.meraki.com)");
    console.log("OLD_BACKEND_URL:", env.OLD_BACKEND_URL || "(default http://localhost:3000)");

    // 2. Predio 606629
    const pred = await p.predio.findFirst({
      where: { codigo: "606629" },
      select: { id: true, codigo: true, nombre: true, merakiNetworkId: true, merakiOrgId: true, merakiNetworkName: true },
    });
    console.log("\nPredio 606629:", JSON.stringify(pred));
    const conNet = await p.predio.count({ where: { merakiNetworkId: { not: null } } });
    const total = await p.predio.count();
    console.log(`Predios con merakiNetworkId: ${conNet} / ${total}`);

    // 3. Test API Meraki en vivo
    if (key) {
      try {
        const r = await fetch(base + "/organizations", { headers: { "X-Cisco-Meraki-API-Key": key }, signal: AbortSignal.timeout(15000) });
        console.log("\nGET /organizations →", r.status);
        if (r.ok) {
          const orgs = await r.json();
          console.log("orgs:", orgs.length, JSON.stringify(orgs.slice(0, 5).map((o) => ({ id: o.id, name: o.name }))));
          const orgId = env.MERAKI_ORG_ID || (orgs[0] && orgs[0].id);
          if (orgId) {
            const rn = await fetch(base + `/organizations/${orgId}/networks?perPage=5`, { headers: { "X-Cisco-Meraki-API-Key": key }, signal: AbortSignal.timeout(15000) });
            console.log(`GET /organizations/${orgId}/networks →`, rn.status);
            if (rn.ok) { const nets = await rn.json(); console.log("networks (muestra):", nets.length, JSON.stringify(nets.slice(0, 3).map((n) => n.name))); }
            else console.log("networks err:", (await rn.text()).slice(0, 200));
          }
        } else {
          console.log("orgs err body:", (await r.text()).slice(0, 200));
        }
      } catch (e) { console.log("API test FALLÓ:", e.message); }
    }

    // 4. Legacy backend (puerto 3000)
    const lb = env.OLD_BACKEND_URL || "http://localhost:3000";
    try {
      const r = await fetch(lb + "/api/predios/search?q=606629", { signal: AbortSignal.timeout(5000) });
      console.log("\nLegacy backend", lb, "→", r.status);
    } catch (e) { console.log("\nLegacy backend", lb, "INALCANZABLE:", e.message); }
  } catch (e) { console.error("ERR", e.message); } finally { await p.$disconnect(); }
})();
