#!/usr/bin/env node

const baseUrl = (process.argv[2] || process.env.SMOKE_BASE_URL || "http://localhost:3000").replace(/\/$/, "");

const checks = [
  {
    name: "health",
    path: "/api/health",
    expect: async (res) => {
      if (res.status !== 200) return `esperado 200, recibido ${res.status}`;
      const data = await res.json().catch(() => null);
      return data?.status === "ok" ? null : "respuesta health invalida";
    },
  },
  {
    name: "login page",
    path: "/login",
    expect: async (res) => res.status === 200 ? null : `esperado 200, recibido ${res.status}`,
  },
  {
    name: "protected me",
    path: "/api/auth/me",
    expect: async (res) => [401, 403].includes(res.status) ? null : `esperado 401/403 sin sesion, recibido ${res.status}`,
  },
  {
    name: "protected data quality",
    path: "/api/calidad-datos",
    expect: async (res) => [401, 403].includes(res.status) ? null : `esperado 401/403 sin sesion, recibido ${res.status}`,
  },
  {
    name: "protected field dictionary",
    path: "/api/diccionario-campos",
    expect: async (res) => [401, 403].includes(res.status) ? null : `esperado 401/403 sin sesion, recibido ${res.status}`,
  },
];

const results = [];

for (const check of checks) {
  const url = `${baseUrl}${check.path}`;
  const started = Date.now();
  try {
    const res = await fetch(url, { redirect: "manual" });
    const error = await check.expect(res.clone());
    results.push({ ...check, ok: !error, status: res.status, ms: Date.now() - started, error });
  } catch (error) {
    results.push({ ...check, ok: false, status: "ERR", ms: Date.now() - started, error: error instanceof Error ? error.message : String(error) });
  }
}

for (const result of results) {
  const mark = result.ok ? "OK" : "FAIL";
  console.log(`${mark} ${result.name} ${result.status} ${result.ms}ms ${result.path}${result.error ? ` - ${result.error}` : ""}`);
}

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`Smoke failed: ${failed.length}/${results.length}`);
  process.exit(1);
}

console.log(`Smoke passed: ${results.length}/${results.length} checks on ${baseUrl}`);
