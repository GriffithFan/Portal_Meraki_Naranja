const XLSX = require("xlsx");
const path = require("path");

const wb = XLSX.utils.book_new();

// ── Hoja 1: Equipos (solo encabezados, para llenar) ─────────────────────────
// Match por NÚMERO DE SERIE: si el N/S ya existe → ACTUALIZA; si no → CREA.
// SIN columnas de ID ni Nº inventario a propósito (el match cae al serial).
const headers = [
  "N/S", "Equipo", "Modelo", "Estado", "Asignado",
  "Ubicación", "Fecha", "Proveedor", "Etiqueta", "Categoría", "Notas",
];
const ws = XLSX.utils.aoa_to_sheet([headers]);
ws["!cols"] = headers.map((h) => ({ wch: Math.max(14, h.length + 6) }));
XLSX.utils.book_append_sheet(wb, ws, "Equipos");

// ── Hoja 2: Instrucciones ───────────────────────────────────────────────────
const inst = [
  ["INSTRUCTIVO — Modificar equipos por serial + Agregar nuevos (en una sola importación)"],
  [""],
  ["Esta plantilla sirve para las DOS cosas a la vez, en la misma hoja 'Equipos':"],
  ["  • MODIFICAR equipos que ya existen  → identificados por su NÚMERO DE SERIE (N/S)."],
  ["  • AGREGAR equipos nuevos            → filas con N/S vacío (o un serial nuevo)."],
  [""],
  ["El importador matchea por N/S: si el serial YA existe → ACTUALIZA ese equipo;"],
  ["si NO existe (o el N/S está vacío) → CREA uno nuevo. Todo en una sola pasada."],
  [""],
  ["── CÓMO LLENAR CADA FILA ────────────────────────────────────────────────"],
  ["MODIFICAR (existente): poné el N/S del equipo + SOLO las columnas que querés"],
  ["   cambiar. Las celdas que dejes VACÍAS no se tocan (no pisan el valor real)."],
  ["   Cada fila puede tener estado/ubicación distintos, no hay problema."],
  ["AGREGAR (nuevo): dejá el N/S VACÍO (o un serial nuevo) y llená 'Equipo' (nombre)."],
  ["   Lo único obligatorio para un alta es 'Equipo'."],
  [""],
  ["── 5 REGLAS PARA QUE SALGA LIMPIO ───────────────────────────────────────"],
  ["1) El N/S debe coincidir EXACTO con el serial cargado (mayúsculas/espacios incluidos)."],
  ["2) Celda vacía NO pisa: en las filas a modificar, llená solo lo que cambia."],
  ["3) NO repitas el mismo N/S en dos filas (da error 'Número de serie duplicado')."],
  ["4) NO agregues columnas de ID ni Nº inventario: se dejan afuera a propósito."],
  ["5) 'Asignado' = nombre del técnico (se matchea automáticamente)."],
  [""],
  ["Valores válidos de 'Estado':"],
  ["Disponible"], ["Instalado"], ["En tránsito"], ["Roto"], ["Perdido"], ["En reparación"], ["Baja"],
  [""],
  ["'Fecha' es opcional; si la dejás vacía, al CREAR se pone la de hoy (al modificar no cambia)."],
  ["'Etiqueta' es texto libre; se le asigna un color automático."],
  [""],
  ["── CÓMO IMPORTAR ────────────────────────────────────────────────────────"],
  ["1) Dashboard → Importar → tipo 'Equipo' → subí este archivo."],
  ["2) En el mapeo de columnas, verificá que N/S quede mapeado a 'Número de Serie'."],
  ["3) Tildá 'Actualizar existentes'."],
  ["4) Vista previa (dry-run): muestra cuántos CREA / ACTUALIZA / OMITE, sin escribir nada."],
  ["5) Revisá esos números y recién ahí 'Confirmar e importar'."],
  [""],
  ["── EJEMPLOS (no copiar a la hoja Equipos) ───────────────────────────────"],
  ["N/S = ABC123  Estado = En reparación        → modifica el estado de ese equipo."],
  ["N/S = XYZ789  Ubicación = Depósito Central   → modifica solo la ubicación."],
  ["N/S vacío     Equipo = MR44  Estado = Disponible  → crea un equipo nuevo."],
];
const ws2 = XLSX.utils.aoa_to_sheet(inst);
ws2["!cols"] = [{ wch: 100 }];
XLSX.utils.book_append_sheet(wb, ws2, "Instrucciones");

const out = path.join(__dirname, "..", "Plantilla_Stock_Modificar.xlsx");
XLSX.writeFile(wb, out);
console.log("OK ->", out, "(hojas:", wb.SheetNames.join(", "), ")");
