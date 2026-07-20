import { spawn } from "child_process";
import { writeFile, readFile, unlink } from "fs/promises";
import { readFileSync } from "fs";
import path from "path";
import os from "os";
import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { parsearExcelExtractor } from "./parseExcel";
import { cargarPrediosPorCodigo } from "./cargar";
import { planificarEnriquecimiento } from "./aplicar";
import { aplicarCambiosEnDB, backupBestEffort, filasEntradaDesdePredios } from "./persistir";
import { resumenDePlan, type ParSnapshot } from "./procesar";
import type { AlcanceSpec, PredioAlcance } from "./alcance";

/* eslint-disable @typescript-eslint/no-explicit-any */

const EXTRACTOR_DIR = process.env.EXTRACTOR_DIR || "/var/www/carrot/extractor";
const EXTRACTOR_PYTHON = process.env.EXTRACTOR_PYTHON || path.join(EXTRACTOR_DIR, ".venv/bin/python");
const EXTRACTOR_SCRIPT = "extractor_datos_predio_incidencia.py";
const CREDS = ["SALESFORCE_URL_BASE", "SALESFORCE_USERNAME", "SALESFORCE_PASSWORD"] as const;

/**
 * Devuelve el env para el subproceso con las credenciales de Salesforce
 * garantizadas: usa process.env y, si falta alguna, la lee del .env del servidor
 * como respaldo (por si Next no la cargó). Lanza error claro si no están.
 */
function envConCredenciales(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  const faltan = CREDS.filter((k) => !env[k]);
  if (faltan.length > 0) {
    try {
      const envPath = path.join(process.env.APP_DIR || "/var/www/carrot", ".env");
      const contenido = readFileSync(envPath, "utf8");
      for (const k of faltan) {
        const m = contenido.match(new RegExp(`^${k}=(.*)$`, "m"));
        if (m) env[k] = m[1].trim().replace(/^["']|["']$/g, "");
      }
    } catch { /* se valida abajo */ }
  }
  const siguenFaltando = CREDS.filter((k) => !env[k]);
  if (siguenFaltando.length > 0) {
    throw new Error(`Faltan credenciales en el servidor: ${siguenFaltando.join(", ")}`);
  }
  return env;
}

async function setProgreso(jobId: string, progreso: any) {
  try {
    await prisma.enriquecimientoJob.update({ where: { id: jobId }, data: { resumen: { progreso } as any } });
  } catch { /* no bloquear por el progreso */ }
}

/**
 * Corre el extractor de Salesforce (proceso Python + Chrome headless) para los
 * pares del job y aplica el resultado con la misma lógica segura de la Fase 1.
 * Pensado para lanzarse fire-and-forget desde la ruta; actualiza el estado del
 * job a medida que avanza (EJECUTANDO → APLICADO | ERROR).
 */
export async function ejecutarExtraccion(
  jobId: string,
  predios: PredioAlcance[],
  alcance: AlcanceSpec
): Promise<void> {
  const inPath = path.join(os.tmpdir(), `enriq_in_${jobId}.xlsx`);
  const outPath = path.join(os.tmpdir(), `enriq_out_${jobId}.xlsx`);
  const pares = predios
    .filter((p) => p.codigo && p.incidencia)
    .map((p) => ({ predioId: p.id, codigo: p.codigo, incidencia: p.incidencia })) as ParSnapshot[];

  try {
    // 1. Escribir el Excel de entrada (Predio + Incidencia + contexto).
    const rows = filasEntradaDesdePredios(predios);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Entrada");
    await writeFile(inPath, XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer);

    await setProgreso(jobId, { fase: "Iniciando sesión en Salesforce", hechos: 0, total: pares.length });

    // 2. Lanzar el extractor de Python (login con Chrome headless + fetch paralelo).
    const env = envConCredenciales();
    await new Promise<void>((resolve, reject) => {
      const proc = spawn(
        EXTRACTOR_PYTHON,
        [
          EXTRACTOR_SCRIPT,
          "--input", inPath,
          "--output", outPath,
          "--predio-col", "Predio",
          "--incidencia-col", "Incidencia",
          "--workers", "8",
          "--no-page-cache",
        ],
        { cwd: EXTRACTOR_DIR, env }
      );

      let stderrTail = "";
      let buffer = "";
      const onData = (chunk: Buffer) => {
        buffer += chunk.toString();
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";
        for (const line of lines) {
          let m: RegExpMatchArray | null;
          if ((m = line.match(/paginas:\s*(\d+)\/(\d+)/))) {
            setProgreso(jobId, { fase: "Descargando fichas", hechos: +m[1], total: +m[2] });
          } else if ((m = line.match(/predios:\s*(\d+)\/(\d+)/))) {
            setProgreso(jobId, { fase: "Buscando predios", hechos: +m[1], total: +m[2] });
          } else if ((m = line.match(/incidencias:\s*(\d+)\/(\d+)/))) {
            setProgreso(jobId, { fase: "Buscando incidencias", hechos: +m[1], total: +m[2] });
          }
        }
      };
      proc.stdout.on("data", onData);
      proc.stderr.on("data", (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-2000); });
      proc.on("error", (e) => reject(e));
      proc.on("close", (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Extractor terminó con código ${code}. ${stderrTail.trim().slice(-500)}`));
      });
    });

    // 3. Leer la salida y aplicar con la lógica segura.
    await setProgreso(jobId, { fase: "Aplicando datos", hechos: 0, total: pares.length });
    const buf = await readFile(outPath);
    const { filas, comentariosPorCodigo } = parsearExcelExtractor(buf);
    const prediosPorCodigo = await cargarPrediosPorCodigo(pares.map((p) => p.predioId));
    const plan = planificarEnriquecimiento(filas, prediosPorCodigo, comentariosPorCodigo, {
      excluirConforme: alcance.excluirConforme !== false,
      excluirYaEnriquecidos: Boolean(alcance.excluirYaEnriquecidos),
    });
    const resumen = resumenDePlan(plan);

    if (plan.cambios.length > 0) {
      await backupBestEffort();
      const { cambiosPrevios } = await aplicarCambiosEnDB(jobId, plan.cambios, prediosPorCodigo);
      await prisma.enriquecimientoJob.update({
        where: { id: jobId },
        data: { estado: "APLICADO", aplicadoAt: new Date(), resumen: resumen as any, cambiosPrevios: cambiosPrevios as any },
      });
    } else {
      await prisma.enriquecimientoJob.update({
        where: { id: jobId },
        data: { estado: "APLICADO", aplicadoAt: new Date(), resumen: resumen as any },
      });
    }
  } catch (e) {
    const msg = (e as Error).message || "Error desconocido en la extracción";
    console.error("[enriquecimiento] ejecución falló:", msg);
    await prisma.enriquecimientoJob.update({
      where: { id: jobId },
      data: { estado: "ERROR", resumen: { error: msg } as any },
    }).catch(() => {});
  } finally {
    await unlink(inPath).catch(() => {});
    await unlink(outPath).catch(() => {});
  }
}
