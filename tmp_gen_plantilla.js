const XLSX = require('xlsx');
const wb = XLSX.utils.book_new();

// Hoja 1: Equipos (solo encabezados, para llenar). SIN ID interno ni Nº inv → se asignan solos.
const headers = ["Equipo","Modelo","N/S","Estado","Asignado","Ubicación","Fecha","Proveedor","Etiqueta","Categoría","Notas"];
const ws = XLSX.utils.aoa_to_sheet([headers]);
ws["!cols"] = headers.map(h => ({ wch: Math.max(12, h.length + 4) }));
XLSX.utils.book_append_sheet(wb, ws, "Equipos");

// Hoja 2: Instrucciones
const inst = [
  ["INSTRUCTIVO — Carga de equipos nuevos al stock"],
  [""],
  ["1) Llená UNA fila por equipo en la hoja 'Equipos'. La única columna obligatoria es 'Equipo' (nombre)."],
  ["2) NO agregues columnas de ID ni Nº de inventario: el sistema se los asigna solo al crearlos."],
  ["3) Importá en: Dashboard -> Importar -> tipo 'Equipo' -> subir este archivo."],
  [""],
  ["Valores válidos de 'Estado':"],
  ["Disponible"],["Instalado"],["En tránsito"],["Roto"],["Perdido"],["En reparación"],["Baja"],
  [""],
  ["Notas:"],
  ["- Si no tenés serial (N/S), dejalo vacío: igual se crea y se diferencia por el Nº de inventario que se le asigna."],
  ["- 'Asignado' debe ser el nombre del técnico (se intenta matchear automáticamente)."],
  ["- 'Fecha' opcional; si la dejás vacía se pone la de hoy."],
  ["- Etiqueta: texto libre; se le asigna un color automático."],
];
const ws2 = XLSX.utils.aoa_to_sheet(inst);
ws2["!cols"] = [{ wch: 95 }];
XLSX.utils.book_append_sheet(wb, ws2, "Instrucciones");

XLSX.writeFile(wb, "../Plantilla_Stock_Nuevos.xlsx");
console.log("OK -> Plantilla_Stock_Nuevos.xlsx (hojas:", wb.SheetNames.join(", "), ")");
