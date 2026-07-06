import { NextResponse } from "next/server";
import { getSession, isModOrAdmin } from "@/lib/auth";
import { open, stat } from "fs/promises";
import { join } from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Catálogo whitelisteado de archivos de log que se pueden ver desde el panel.
// (Evita que se pueda leer cualquier archivo del VPS por path traversal.)
const LOG_FILES: Record<string, { label: string; path: string }> = {
  "pm2-error": { label: "PM2 — errores", path: join(process.cwd(), "logs", "pm2-error.log") },
  "pm2-out": { label: "PM2 — salida", path: join(process.cwd(), "logs", "pm2-out.log") },
  "reportes-cron": { label: "Cron — reportes", path: join(process.cwd(), "logs", "reportes-cron.log") },
  "anuncios-cron": { label: "Cron — anuncios", path: join(process.cwd(), "logs", "anuncios-cron.log") },
  "nginx-error": { label: "nginx — errores", path: "/var/log/nginx/error.log" },
  "nginx-access": { label: "nginx — accesos", path: "/var/log/nginx/access.log" },
};

const ERROR_RE = /error|failed|fail|exception|prisma|timeout|unhandled|econn|warn|fatal|denied|refused/i;
const MAX_BYTES = 1024 * 1024; // leemos a lo sumo el último 1 MB del archivo

async function tailFile(path: string, maxLines: number, errorsOnly: boolean) {
  const info = await stat(path);
  const start = Math.max(0, info.size - MAX_BYTES);
  const fh = await open(path, "r");
  try {
    const len = info.size - start;
    const buf = Buffer.alloc(len);
    if (len > 0) await fh.read(buf, 0, len, start);
    let text = buf.toString("utf8");
    if (start > 0) {
      const nl = text.indexOf("\n");
      if (nl >= 0) text = text.slice(nl + 1); // descartar primera línea parcial
    }
    let lines = text.split(/\r?\n/).filter((l) => l.length > 0);
    if (errorsOnly) lines = lines.filter((l) => ERROR_RE.test(l));
    return { lines: lines.slice(-maxLines), size: info.size, modifiedAt: info.mtime.toISOString(), truncado: start > 0 };
  } finally {
    await fh.close();
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const file = searchParams.get("file");

  // Sin archivo → devolver catálogo (con existencia/tamaño) para el selector.
  if (!file) {
    const catalogo = await Promise.all(
      Object.entries(LOG_FILES).map(async ([key, def]) => {
        try {
          const info = await stat(def.path);
          return { key, label: def.label, exists: true, size: info.size, modifiedAt: info.mtime.toISOString() };
        } catch {
          return { key, label: def.label, exists: false, size: 0, modifiedAt: null };
        }
      })
    );
    return NextResponse.json({ catalogo });
  }

  const def = LOG_FILES[file];
  if (!def) return NextResponse.json({ error: "Archivo no permitido" }, { status: 400 });

  const lines = Math.min(Math.max(parseInt(searchParams.get("lines") || "200", 10) || 200, 10), 2000);
  const errorsOnly = searchParams.get("errorsOnly") === "1";

  try {
    const result = await tailFile(def.path, lines, errorsOnly);
    return NextResponse.json({ file, label: def.label, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: `No se pudo leer el log: ${e?.message || "desconocido"}`, file, label: def.label, lines: [], exists: false }, { status: 200 });
  }
}
