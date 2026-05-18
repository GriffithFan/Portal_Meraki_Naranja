# Auditoria Next 16 / React 19

Fecha: 2026-05-06
Proyecto: `carrot` / Portal Meraki Naranja
Estado auditado: workspace local con Next `16.2.4`, React `18.3.1`

## Resumen Ejecutivo

La migracion a Next 16 es recomendable para este proyecto: usa App Router, no tiene Pages Router, `npm install` funciona, el build Next 16 compila, TypeScript no reporta errores, lint no tiene errores y el smoke local pasa 5/5. No hay bloqueantes para Next 16 en el estado actual.

La migracion a React 19 debe ser una fase separada: la app todavia declara `react`/`react-dom`/types en 18, pero `react-leaflet@5.0.0` ya exige React 19. Por eso `npm ls react react-dom react-leaflet next --depth=1` falla con `ELSPROBLEMS` aunque `npm install` resuelve por `.npmrc` con `legacy-peer-deps=true` y el build pasa.

Riesgo global: `medium`. No por Next 16, sino por peer deps React 18/19, `middleware.ts` deprecado, warning Turbopack NFT y vulnerabilidades npm pendientes (`xlsx` sin fix disponible).

## Validaciones Ejecutadas

| Comando | Resultado |
| --- | --- |
| `node -v` local | `v22.20.0` |
| `npm -v` local | `11.7.0` |
| VPS `node -v` | `v20.20.2` compatible con Next 16 `>=20.9.0` |
| VPS `npm -v` | `10.8.2` |
| VPS PM2 | `carrot` online |
| `npm install` | OK, Prisma Client generado, 5 vulnerabilidades npm |
| `npm run lint` | 0 errores, 13 warnings |
| `npm run build` | OK, 90/90 paginas, warning middleware y NFT |
| `npm test --if-present` | Sin salida: no hay test script configurado |
| `node scripts/smoke.mjs http://localhost:3002` | OK 5/5 |
| `npm audit --json` | 5 vulnerabilidades: 4 moderate, 1 high |
| `get_errors` sobre `src` | Sin errores |

## Arquitectura

| Area | Estado | Riesgo | Notas |
| --- | --- | --- | --- |
| App Router | Compatible | low | Existe `src/app`; 111 archivos `page/layout/route` relevantes. |
| Pages Router | No usado | low | No existen `pages` ni `src/pages`; no hay bloqueante Pages Router. |
| Server Components | Uso limitado | low | `src/app/layout.tsx` es server; la mayoria de pantallas dashboard son client. |
| Client Components | Alto uso | medium | 88 archivos con `"use client"`; valido pero reduce beneficios de Server Components. |
| `window/document/navigator` | Compatible | low | Las ocurrencias estan en archivos client (`"use client"`) o handlers de eventos/effects. |
| `middleware.ts` | Funciona, deprecado | medium | Next 16 advierte migrar a `proxy.ts`. |
| Webpack custom | No detectado | low | `next.config.mjs` no define `webpack`; solo `turbopack.root`. |
| Turbopack | Build OK con warning | medium | Warning NFT por filesystem dinamico en `src/app/api/actas/route.ts`. |

## APIs Async de Next 16

| API | Estado | Evidencia |
| --- | --- | --- |
| `cookies()` | OK | `src/lib/auth.ts` usa `await cookies()` en `getSession`, `setTokenCookie`, `removeTokenCookie`. |
| `headers()` | OK | No se detecto uso directo de `headers()` de `next/headers`. |
| `params` en route handlers | OK | Build TypeScript pasa; no quedaron firmas `params: { id: string }` en `route.ts`. |
| `searchParams` | OK | Usos client con `URLSearchParams`; no se detecto Page prop server mal tipada. |

## Dependencias

Formato: `react19` y `next16` significan compatibilidad declarada o inferida desde peer deps instaladas. `unknown` significa sin peer deps React/Next explicitas; en librerias no React suele ser riesgo bajo.

| name | version | react19 | next16 | risk | notes |
| --- | --- | --- | --- | --- | --- |
| `@base-ui/react` | `1.3.0` | compatible | unknown | low | peer React `^17 || ^18 || ^19`. |
| `@dnd-kit/core` | `6.3.1` | compatible | unknown | low | peer React `>=16.8.0`. |
| `@dnd-kit/sortable` | `10.0.0` | compatible | unknown | low | peer React `>=16.8.0`. |
| `@dnd-kit/utilities` | `3.2.2` | compatible | unknown | low | peer React `>=16.8.0`. |
| `@prisma/client` | `5.22.0` | unknown | unknown | low | Node `>=16.13`; sin peer React/Next. |
| `@tanstack/react-query` | `5.91.3` | compatible | unknown | low | peer React `^18 || ^19`. |
| `@tanstack/react-table` | `8.21.3` | compatible | unknown | low | peer React `>=16.8`. |
| `@types/bcryptjs` | `2.4.6` | unknown | unknown | low | Tipos, sin peer deps. |
| `@types/leaflet` | `1.9.21` | unknown | unknown | low | Tipos, sin peer deps. |
| `@types/node` | `20.19.37` | unknown | unknown | low | Compatible con Node 20/22. |
| `@types/qrcode` | `1.5.6` | unknown | unknown | low | Tipos, sin peer deps. |
| `@types/react` | `18.3.28` | incompatible | unknown | medium | Debe subir a `^19` si se migra React 19. |
| `@types/react-dom` | `18.3.7` | incompatible | unknown | medium | Debe subir a `^19` si se migra React 19. |
| `@types/web-push` | `3.6.4` | unknown | unknown | low | Tipos, sin peer deps. |
| `axios` | `1.15.2` | unknown | unknown | low | Sin peer deps React/Next. |
| `bcryptjs` | `3.0.3` | unknown | unknown | low | Sin peer deps React/Next. |
| `class-variance-authority` | `0.7.1` | unknown | unknown | low | Sin peer deps React/Next. |
| `clsx` | `2.1.1` | unknown | unknown | low | Sin peer deps React/Next. |
| `cmdk` | `1.1.1` | compatible | unknown | low | peer React `^18 || ^19`. |
| `date-fns` | `4.1.0` | unknown | unknown | low | Sin peer deps React/Next. |
| `eslint` | `9.39.4` | unknown | unknown | low | Node `^18.18 || ^20.9 || >=21.1`. |
| `eslint-config-next` | `16.2.4` | unknown | compatible | low | ESLint config de Next 16. |
| `framer-motion` | `12.38.0` | compatible | unknown | low | peer React `^18 || ^19`. |
| `html-to-image` | `1.11.13` | unknown | unknown | low | Browser utility. |
| `html2canvas` | `1.4.1` | unknown | unknown | low | Browser utility. |
| `jose` | `6.2.1` | unknown | unknown | low | Sin peer deps React/Next. |
| `jspdf` | `4.2.1` | unknown | unknown | low | Browser/server utility. |
| `leaflet` | `1.9.4` | unknown | unknown | medium | Browser-only; se usa desde client/dynamic map. |
| `lucide-react` | `0.577.0` | compatible | unknown | low | peer React `^16.5.1 || ^17 || ^18 || ^19`. |
| `next` | `16.2.4` | compatible | compatible | low | peer React `^18.2 || ^19`; Node `>=20.9.0`. |
| `next-themes` | `0.4.6` | compatible | unknown | low | peer React `^16.8 || ^17 || ^18 || ^19`. |
| `nuqs` | `2.8.9` | compatible | compatible | low | peer Next `>=14.2.0`; React `>=18.2 || ^19`. |
| `postcss` | `8.5.12` | unknown | unknown | low | Direct version ok, pero Next trae PostCSS interno vulnerable segun audit. |
| `prisma` | `5.22.0` | unknown | unknown | low | Node `>=16.13`. |
| `qrcode` | `1.5.4` | unknown | unknown | low | Sin peer deps React/Next. |
| `react` | `18.3.1` | incompatible | compatible | medium | Para React 19 debe subir a `^19`; Next 16 soporta React 18. |
| `react-day-picker` | `9.14.0` | compatible | unknown | low | peer React `>=16.8.0`. |
| `react-dom` | `18.3.1` | incompatible | compatible | medium | Para React 19 debe subir a `^19`. |
| `react-leaflet` | `5.0.0` | compatible | unknown | high | BLOQUEANTE para React 18 estricto: peer exige React/DOM `^19.0.0`; hoy solo instala por `legacy-peer-deps=true`. |
| `react-virtuoso` | `4.18.3` | compatible | unknown | low | peer React `>=16 || >=17 || >=18 || >=19`. |
| `recharts` | `2.15.4` | compatible | unknown | low | peer React `^16 || ^17 || ^18 || ^19`. |
| `shadcn` | `4.1.0` | unknown | unknown | low | CLI/utilidad, sin peer deps. |
| `sonner` | `2.0.7` | compatible | unknown | low | peer React `^18 || ^19`. |
| `tailwind-merge` | `3.5.0` | unknown | unknown | low | Sin peer deps React/Next. |
| `tailwindcss` | `3.4.19` | unknown | unknown | low | Node `>=14`. |
| `tailwindcss-animate` | `1.0.7` | unknown | unknown | low | Sin peer deps React/Next. |
| `tsx` | `4.21.0` | unknown | unknown | low | Node `>=18`. |
| `tw-animate-css` | `1.4.0` | unknown | unknown | low | Sin peer deps React/Next. |
| `typescript` | `5.9.3` | unknown | unknown | low | Node `>=14.17`. |
| `vaul` | `1.1.2` | compatible | unknown | low | peer React `^16.8 || ^17 || ^18 || ^19`. |
| `web-push` | `3.6.7` | unknown | unknown | low | Node `>=16`. |
| `xlsx` | `0.18.5` | unknown | unknown | high | Vulnerable, sin fix npm disponible; aislar/reemplazar parser. |
| `zod` | `4.3.6` | unknown | unknown | low | Sin peer deps React/Next. |

## Hallazgos Clasificados

### Critico

Ningun hallazgo critico bloquea Next 16: `npm install`, `npm run build`, lint y smoke pasan.

Para React 19, hay una accion manual obligatoria: actualizar `react`, `react-dom`, `@types/react`, `@types/react-dom` en conjunto y probar UI. No hacer React 19 en el mismo despliegue que Next 16.

### Warning

1. `src/middleware.ts`: Next 16 advierte que `middleware` esta deprecado; migrar a `src/proxy.ts`.
2. `src/app/api/actas/route.ts`: warning Turbopack NFT por filesystem dinamico aun con comentarios `turbopackIgnore`.
3. `.npmrc`: `legacy-peer-deps=true` oculta conflicto actual de `react-leaflet@5` con React 18.
4. `npm audit`: `xlsx` high sin fix disponible; `next`/PostCSS moderate con advisory en dependencia interna; `express-rate-limit`/`ip-address` moderate transitivos.
5. React Hooks: lint muestra 3 warnings de dependencias faltantes (`TECNICO_COLORS_LEGEND`, `openDetail`, `loadedSections`).
6. React Compiler: reglas nuevas quedaron apagadas temporalmente en `eslint.config.mjs`; no bloquea Next 16, pero limita adopcion estricta.
7. Testing: no hay Jest/Vitest/Cypress/Playwright ni script `test`; solo smoke custom.
8. Entorno local: `.env` usa secretos de desarrollo segun runtime; no asumir que produccion tiene el mismo problema.

### Mejora

1. Reducir paginas client-only donde no haga falta para aprovechar mejor Server Components.
2. Agregar `loading.tsx`/`error.tsx` en dashboards pesados.
3. Reemplazar `xlsx` por parser mantenido o aislarlo en proceso/worker con limites estrictos.
4. Habilitar gradualmente reglas React Compiler despues de estabilizar React 19.

## Archivos que Deben Modificarse

| Archivo | Motivo | Prioridad |
| --- | --- | --- |
| `src/middleware.ts` -> `src/proxy.ts` | Deprecacion Next 16 | warning |
| `src/app/api/actas/route.ts` | Reducir warning Turbopack NFT con paths mas estaticos | warning |
| `package.json` | Fase React 19: subir React/DOM/types; revisar `xlsx` | manual |
| `package-lock.json` | Fase React 19 y/o reemplazo `xlsx` | manual |
| `.npmrc` | Quitar `legacy-peer-deps=true` cuando React 19 este aplicado | manual |
| `eslint.config.mjs` | Rehabilitar reglas React Compiler por fases | mejora |
| `src/app/dashboard/predios/page.tsx` | Agregar dependencia `TECNICO_COLORS_LEGEND` o mover constante | mejora |
| `src/app/dashboard/tareas/page.tsx` | Resolver dependencia `openDetail` del effect | mejora |
| `src/contexts/NetworkContext.tsx` | Resolver dependencia `loadedSections` | mejora |

## Ejemplos Concretos de Fixes

### Migrar middleware a proxy

```ts
// src/proxy.ts
export { middleware as proxy, config } from "./middleware";
```

O preferible en fase limpia: renombrar `middleware` a `proxy`, exportar `proxy(request: NextRequest)` y validar build/smoke.

### React 19 fase separada

```json
{
  "react": "^19",
  "react-dom": "^19",
  "@types/react": "^19",
  "@types/react-dom": "^19"
}
```

Luego quitar temporalmente `legacy-peer-deps=true` y correr `npm install`, `npm ls react react-dom react-leaflet next --depth=1`, build, lint y smoke.

### Turbopack/NFT en actas

```ts
const uploadsRoot = path.resolve(process.cwd(), "uploads");
const actasRoot = path.join(uploadsRoot, "actas");
const filePath = path.join(actasRoot, safeName);
```

Evitar `path.join(process.cwd(), existing.archivoRuta)` cuando `existing.archivoRuta` venga de DB; convertir primero a relativa validada contra una carpeta fija.

## JSON Final

```json
{
  "summary": "El proyecto esta apto para Next 16: usa App Router, no tiene Pages Router, npm install funciona, build Next 16 compila, lint no tiene errores y smoke local pasa 5/5. React 19 debe quedar como fase separada porque el proyecto aun declara React/DOM/types 18 y react-leaflet@5 exige React 19; npm resuelve hoy por legacy-peer-deps. Hay warnings de middleware deprecado, Turbopack NFT, vulnerabilidades npm y falta de tests formales.",
  "global_risk": "medium",
  "upgrade_recommended": true,
  "blocking_issues": [],
  "warnings": [
    "src/middleware.ts esta deprecado en Next 16; migrar a proxy.ts",
    "Turbopack/NFT warning en src/app/api/actas/route.ts por filesystem dinamico",
    "react-leaflet@5 exige React 19 mientras el proyecto corre React 18; npm ls falla con ELSPROBLEMS",
    "npm audit reporta 5 vulnerabilidades: xlsx high sin fix disponible y advisories moderate transitivos",
    "No hay suite Jest/Vitest/Cypress/Playwright ni script test formal",
    "React Compiler rules estan desactivadas temporalmente en eslint.config.mjs",
    "Lint conserva 13 warnings, incluidos 3 de deps de hooks"
  ],
  "auto_fixable": [
    "Eliminar eslint-disable no usados reportados por lint",
    "Agregar o ajustar dependencias de hooks en predios, tareas y NetworkContext",
    "Crear wrapper o renombrar middleware a proxy en fase corta",
    "Reestructurar paths de actas para quitar warning Turbopack"
  ],
  "manual_fixes": [
    "Subir React, React DOM y tipos a 19 en fase separada",
    "Quitar legacy-peer-deps cuando React 19 este validado",
    "Reemplazar o aislar xlsx por vulnerabilidades sin fix",
    "Agregar suite de tests minima para login, permisos, tareas, uploads y chat"
  ],
  "estimated_effort": "medium",
  "migration_strategy": [
    "Mantener Next 16 con React 18 como primer despliegue controlado, ya que build/lint/smoke pasan",
    "Antes de produccion: backup pre-next16, deploy remoto, npm install, npm run build, PM2 restart, health y smoke",
    "Despues del deploy Next 16: migrar middleware.ts a proxy.ts y corregir warning Turbopack de actas",
    "En fase separada: subir React/React DOM/@types a 19, quitar legacy-peer-deps y validar npm ls/build/lint/smoke",
    "En fase de seguridad: reemplazar o aislar xlsx y agregar tests formales"
  ]
}
```