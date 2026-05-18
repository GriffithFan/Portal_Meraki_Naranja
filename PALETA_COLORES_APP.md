# Paleta de colores de la app

Este documento resume la paleta visual usada por Portal Meraki Naranja. La fuente principal esta en `tailwind.config.ts` y los tokens globales/dark mode estan en `src/app/globals.css`.

## Identidad visual

La app usa una identidad tecnica y limpia basada en:

- Azul ceruleo como color principal de producto.
- Naranja calido como acento visual.
- Neutros azulados para fondos, tablas, tarjetas, bordes, textos y sidebar.
- Modo oscuro con jerarquia tonal propia para pagina, shell, tarjetas y estados elevados.

## Primary - Azul ceruleo

Uso principal: acciones primarias, botones destacados, enlaces activos, foco, estados seleccionados y elementos de navegacion importantes.

| Token | Hex |
| --- | --- |
| `primary-50` | `#ecf8ff` |
| `primary-100` | `#d4efff` |
| `primary-200` | `#b2e3ff` |
| `primary-300` | `#7dd4ff` |
| `primary-400` | `#40bbff` |
| `primary-500` | `#149bff` |
| `primary-600` | `#0082ff` |
| `primary-700` | `#0075ff` |
| `primary-800` | `#0058cc` |
| `primary-900` | `#084da0` |
| `primary-950` | `#0a2f61` |

## Accent - Naranja calido

Uso principal: acentos, highlights, llamadas secundarias, indicadores visuales y contrastes puntuales.

| Token | Hex |
| --- | --- |
| `accent-50` | `#fff8ec` |
| `accent-100` | `#ffeed2` |
| `accent-200` | `#ffdaa4` |
| `accent-300` | `#ffbf6b` |
| `accent-400` | `#ff982f` |
| `accent-500` | `#ff7b07` |
| `accent-600` | `#f96300` |
| `accent-700` | `#cc4700` |
| `accent-800` | `#a33809` |
| `accent-900` | `#83300b` |
| `accent-950` | `#471603` |

## Surface - Neutros azulados

Uso principal: estructura de UI, fondos, tablas, bordes, textos secundarios, sidebar, paneles y jerarquia visual.

| Token | Hex |
| --- | --- |
| `surface-50` | `#f5f8fc` |
| `surface-100` | `#eaf0f7` |
| `surface-200` | `#d6dfeb` |
| `surface-300` | `#b4c4d8` |
| `surface-400` | `#8a9fba` |
| `surface-500` | `#637d9b` |
| `surface-600` | `#4a6180` |
| `surface-700` | `#3a4d66` |
| `surface-800` | `#1e3348` |
| `surface-900` | `#112338` |
| `surface-950` | `#091526` |

## Tokens globales - Modo claro

Estos tokens estan definidos como variables CSS en `:root`.

| Token | Valor |
| --- | --- |
| `--background` | `oklch(0.98 0.005 240)` |
| `--foreground` | `oklch(0.15 0.02 250)` |
| `--card` | `oklch(1 0 0)` |
| `--card-foreground` | `oklch(0.15 0.02 250)` |
| `--popover` | `oklch(1 0 0)` |
| `--popover-foreground` | `oklch(0.15 0.02 250)` |
| `--primary` | `oklch(0.58 0.22 250)` |
| `--primary-foreground` | `oklch(0.99 0 0)` |
| `--secondary` | `oklch(0.94 0.01 240)` |
| `--secondary-foreground` | `oklch(0.2 0.02 250)` |
| `--muted` | `oklch(0.94 0.01 240)` |
| `--muted-foreground` | `oklch(0.5 0.02 250)` |
| `--accent` | `oklch(0.62 0.2 45)` |
| `--accent-foreground` | `oklch(0.99 0 0)` |
| `--destructive` | `oklch(0.577 0.245 27.325)` |
| `--border` | `oklch(0.88 0.01 240)` |
| `--input` | `oklch(0.88 0.01 240)` |
| `--ring` | `oklch(0.58 0.22 250)` |
| `--chart-1` | `oklch(0.58 0.22 250)` |
| `--chart-2` | `oklch(0.62 0.2 45)` |
| `--chart-3` | `oklch(0.55 0.15 160)` |
| `--chart-4` | `oklch(0.65 0.15 300)` |
| `--chart-5` | `oklch(0.70 0.12 80)` |
| `--radius` | `0.625rem` |
| `--sidebar` | `oklch(0.97 0.005 240)` |
| `--sidebar-foreground` | `oklch(0.15 0.02 250)` |
| `--sidebar-primary` | `oklch(0.58 0.22 250)` |
| `--sidebar-primary-foreground` | `oklch(0.99 0 0)` |
| `--sidebar-accent` | `oklch(0.94 0.01 240)` |
| `--sidebar-accent-foreground` | `oklch(0.2 0.02 250)` |
| `--sidebar-border` | `oklch(0.88 0.01 240)` |
| `--sidebar-ring` | `oklch(0.58 0.22 250)` |

## Tokens globales - Modo oscuro

Estos tokens se aplican bajo `.dark`.

| Token | Valor |
| --- | --- |
| `--background` | `oklch(0.16 0.02 250)` |
| `--foreground` | `oklch(0.93 0.01 240)` |
| `--card` | `oklch(0.2 0.025 250)` |
| `--card-foreground` | `oklch(0.93 0.01 240)` |
| `--popover` | `oklch(0.2 0.025 250)` |
| `--popover-foreground` | `oklch(0.93 0.01 240)` |
| `--primary` | `oklch(0.65 0.22 250)` |
| `--primary-foreground` | `oklch(0.12 0.02 250)` |
| `--secondary` | `oklch(0.25 0.02 250)` |
| `--secondary-foreground` | `oklch(0.93 0.01 240)` |
| `--muted` | `oklch(0.25 0.02 250)` |
| `--muted-foreground` | `oklch(0.65 0.015 240)` |
| `--accent` | `oklch(0.65 0.2 45)` |
| `--accent-foreground` | `oklch(0.12 0.02 250)` |
| `--destructive` | `oklch(0.704 0.191 22.216)` |
| `--border` | `oklch(0.3 0.02 250)` |
| `--input` | `oklch(0.3 0.02 250)` |
| `--ring` | `oklch(0.5 0.015 240)` |
| `--chart-1` | `oklch(0.65 0.22 250)` |
| `--chart-2` | `oklch(0.65 0.2 45)` |
| `--chart-3` | `oklch(0.6 0.15 160)` |
| `--chart-4` | `oklch(0.7 0.15 300)` |
| `--chart-5` | `oklch(0.75 0.12 80)` |
| `--sidebar` | `oklch(0.18 0.025 250)` |
| `--sidebar-foreground` | `oklch(0.93 0.01 240)` |
| `--sidebar-primary` | `oklch(0.65 0.22 250)` |
| `--sidebar-primary-foreground` | `oklch(0.93 0.01 240)` |
| `--sidebar-accent` | `oklch(0.25 0.02 250)` |
| `--sidebar-accent-foreground` | `oklch(0.93 0.01 240)` |
| `--sidebar-border` | `oklch(0.3 0.02 250)` |
| `--sidebar-ring` | `oklch(0.5 0.015 240)` |

## Overrides visuales de dark mode

Ademas de las variables, hay algunos colores directos para mejorar la jerarquia visual en modo oscuro.

### Fondos

| Uso | Color |
| --- | --- |
| Page bg | `#0f172a` |
| Shell bg | `#131c2e` |
| Card bg | `#1a2332` |
| Elevated | `#1e293b` |
| Active | `#263549` |
| Muted | `#334155` |

### Textos surface en dark mode

| Token adaptado | Color |
| --- | --- |
| `.dark .text-surface-900` | `#f1f5f9` |
| `.dark .text-surface-800` | `#e2e8f0` |
| `.dark .text-surface-700` | `#cbd5e1` |
| `.dark .text-surface-600` | `#b6c6d8` |
| `.dark .text-surface-500` | `#93a7bd` |
| `.dark .text-surface-400` | `#7f95ad` |
| `.dark .text-surface-300` | `#a9bbcf` |

### Bordes en dark mode

| Token adaptado | Color |
| --- | --- |
| `.dark .border-surface-100` | `#1e293b` |
| `.dark .border-surface-200` | `#2a3a4e` |
| `.dark .border-surface-300` | `#3d5066` |

## Estados y badges frecuentes

La app usa tambien colores semanticos de Tailwind para estados operativos.

| Uso habitual | Clases/colores |
| --- | --- |
| Disponible / ok | `bg-green-100 text-green-700` |
| Instalado / info | `bg-blue-100 text-blue-700` |
| En transito / advertencia | `bg-yellow-100 text-yellow-700` |
| Roto / error | `bg-red-100 text-red-700` |
| Perdido / neutro | `bg-gray-100 text-gray-600` |
| En reparacion | `bg-orange-100 text-orange-700` |
| Baja | `bg-slate-200 text-slate-700` |

## Sombras de marca

Definidas en Tailwind para aportar profundidad suave.

| Token | Valor |
| --- | --- |
| `shadow-soft` | `0 2px 8px -2px rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.06)` |
| `shadow-soft-lg` | `0 4px 16px -4px rgba(0,0,0,0.1), 0 2px 6px -2px rgba(0,0,0,0.06)` |
| `shadow-glow` | `0 0 20px -5px rgba(20,155,255,0.3)` |
| `shadow-glow-accent` | `0 0 20px -5px rgba(255,123,7,0.3)` |

## Uso recomendado

- Usar `primary-600` / `primary-700` para botones principales y elementos activos.
- Usar `accent-500` / `accent-600` solo como acento puntual para no competir con el azul principal.
- Usar `surface-50` a `surface-200` para fondos claros y separadores suaves.
- Usar `surface-700` a `surface-950` para sidebar, textos fuertes y superficies oscuras.
- En dark mode, preferir los tokens ya adaptados en `globals.css` antes que hardcodear nuevos colores.
