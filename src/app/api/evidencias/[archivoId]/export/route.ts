import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { analizarPaquete, completarPredioDesdePaquete } from "@/lib/evidencias";
import { autorizarArchivoChat, asegurarCacheEvidencias, resolverFotoEvidencia } from "@/lib/evidenciasCache";
import AdmZip from "adm-zip";
import path from "path";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Nombre de carpeta/archivo seguro para el ZIP: cambia separadores de ruta por
// guion; conserva espacios, acentos y el guion largo (—) para que sea legible.
function sanitizar(s: string): string {
  const out = (s || "")
    .split(/[\\/:*?"<>|]+/).join("-")
    .replace(/\s+/g, " ")
    .replace(/[.\s]+$/, "")
    .trim()
    .slice(0, 120)
    .trim();
  return out || "sin-nombre";
}

// Genera y descarga un ZIP "traducido": una carpeta por LAC (con el nº de predio
// si se pudo identificar) y, dentro, una subcarpeta por punto con su leyenda, más
// un LEEME.txt que resume cada envío. El XML no trae el predio: sale del nombre.
export async function GET(_request: NextRequest, { params }: { params: Promise<{ archivoId: string }> }) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { archivoId } = await params;
  const info = await autorizarArchivoChat(archivoId, session);
  if (info.error) return info.error;

  try {
    const cacheDir = await asegurarCacheEvidencias(archivoId, info.zipPath);
    const envios = await analizarPaquete(cacheDir);
    completarPredioDesdePaquete(envios, info.nombre);

    const zip = new AdmZip();
    const resumen: string[] = [
      `Evidencias traducidas — ${info.nombre}`,
      `${envios.length} tarea(s) · generado ${new Date().toLocaleString("es-AR")}`,
      `(El nº de predio no viene en el XML; se toma del nombre de la carpeta/envío cuando está.)`,
      "",
    ];

    envios.forEach((env, idx) => {
      const tipo = (env.cron || "").split("/").pop() || "";
      const etiquetaPredio = env.predio ? env.predio : "sin-predio";
      const carpetaEnvio = sanitizar(`${String(idx + 1).padStart(2, "0")} - Predio ${etiquetaPredio} - ${env.nombre} - ${tipo} - ${env.fecha}`);

      resumen.push(`■ ${carpetaEnvio}${env.draft ? "  [BORRADOR]" : ""}`);
      resumen.push(
        `   Predio: ${env.predio || "no identificado"}${env.predioFuente ? ` (del ${env.predioFuente})` : ""}` +
        ` · Técnico: ${env.tecnico || "—"} · ${env.cron || "—"} · Fecha: ${env.fecha || "—"} · ${env.total} foto(s)`
      );

      // Todas las fotos del LAC en UNA sola carpeta; el punto va en el nombre del
      // archivo (así ordenan por punto sin abrir 17 subcarpetas).
      for (const p of env.puntos) {
        resumen.push(`     • ${p.label} — ${p.fotos.length} foto(s)`);
        p.fotos.forEach((f, j) => {
          const abs = resolverFotoEvidencia(archivoId, f.rel);
          if (!abs) return;
          const ext = path.extname(f.rel) || ".jpg";
          const nn = String(j + 1).padStart(2, "0");
          const com = (f.comentario || "").trim();
          // El comentario del técnico va en el nombre del archivo (recortado por
          // sanitizar) y completo en el LEEME.
          const nombreFoto = sanitizar(
            `${p.label} - ${nn}${com ? ` - ${com}` : ""}${f.hora ? ` - ${f.hora.replace(/:/g, "-")}` : ""}`
          ) + ext;
          if (com) resumen.push(`         · ${nn} [${f.hora || "—"}] ${com}`);
          try {
            zip.addLocalFile(abs, carpetaEnvio, nombreFoto);
          } catch { /* foto ilegible: se omite */ }
        });
      }
      resumen.push("");
    });

    zip.addFile("LEEME.txt", Buffer.from(resumen.join("\n"), "utf8"));

    const buf = zip.toBuffer();
    const baseName = sanitizar(info.nombre.replace(/\.zip$/i, "")) + " - traducido.zip";
    const asciiFallback = baseName.replace(/[^\x20-\x7e]/g, "_").replace(/"/g, "");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(baseName)}`,
        "Content-Length": String(buf.length),
        "Cache-Control": "private, no-store",
      },
    });
  } catch (e) {
    console.error("[evidencias/export] error:", (e as Error).message);
    return NextResponse.json({ error: (e as Error).message || "No se pudo exportar" }, { status: 500 });
  }
}
