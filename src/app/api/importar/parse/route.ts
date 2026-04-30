import { NextRequest, NextResponse } from "next/server";
import { getSession, isModOrAdmin } from "@/lib/auth";
import * as XLSX from "xlsx";

const MAX_IMPORT_FILE_SIZE = 20 * 1024 * 1024;
const MAX_PREVIEW_ROWS = 2000;
const MAX_COLUMNS = 200;
const ALLOWED_EXTENSIONS = new Set(["xlsx", "xls", "csv"]);
const ALLOWED_MIME_TYPES = new Set([
  "",
  "application/octet-stream",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  "text/plain",
]);

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const sheetIndex = parseInt(formData.get("sheetIndex") as string) || 0;

    if (!file) {
      return NextResponse.json({ error: "No se proporcionó archivo" }, { status: 400 });
    }

    const extension = getExtension(file.name);
    if (!ALLOWED_EXTENSIONS.has(extension)) {
      return NextResponse.json({ error: "Formato no soportado. Usa .xlsx, .xls o .csv" }, { status: 400 });
    }

    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ error: "Tipo de archivo no soportado" }, { status: 400 });
    }

    if (file.size > MAX_IMPORT_FILE_SIZE) {
      return NextResponse.json({ error: "El archivo no puede superar 20MB" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellFormula: false,
      cellHTML: false,
      cellStyles: false,
      sheetRows: MAX_PREVIEW_ROWS + 1,
    });

    const sheetNames = workbook.SheetNames;
    if (sheetIndex >= sheetNames.length) {
      return NextResponse.json({ error: "Hoja no encontrada" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetNames[sheetIndex]];
    const rawData: unknown[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

    if (rawData.length < 2) {
      return NextResponse.json({ error: "El archivo no contiene datos suficientes" }, { status: 400 });
    }

    const headers = (rawData[0] as string[]).map((h, i) =>
      h ? String(h).trim() : `Columna ${i + 1}`
    );

    if (headers.length > MAX_COLUMNS) {
      return NextResponse.json({ error: `El archivo no puede superar ${MAX_COLUMNS} columnas` }, { status: 400 });
    }

    const rows = rawData.slice(1, MAX_PREVIEW_ROWS + 1).map((row) =>
      headers.map((_, i) => {
        const val = (row as unknown[])[i];
        if (val instanceof Date) return val.toISOString().split("T")[0];
        return val !== undefined && val !== null ? String(val) : "";
      })
    );

    return NextResponse.json({
      fileName: file.name,
      sheetNames,
      currentSheet: sheetIndex,
      headers,
      rows,
      totalRows: rawData.length - 1,
      previewRows: rows.length,
    });
  } catch (err) {
    console.error("Error parsing file:", err);
    return NextResponse.json({ error: "Error al procesar el archivo" }, { status: 500 });
  }
}
