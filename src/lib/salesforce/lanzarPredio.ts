import { spawn } from "child_process";
import path from "path";
import { readFileSync } from "fs";
import { prisma } from "@/lib/prisma";
import { enviarPushYBandeja } from "@/lib/pushNotifications";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Config del extractor (mismo layout que enriquecimiento/ejecutar.ts).
const EXTRACTOR_DIR = process.env.EXTRACTOR_DIR || "/var/www/carrot/extractor";
const EXTRACTOR_PYTHON = process.env.EXTRACTOR_PYTHON || path.join(EXTRACTOR_DIR, ".venv/bin/python");
const SCRIPT = path.join(EXTRACTOR_DIR, "lanzar_predio_ni.py");
const CREDS = ["SALESFORCE_URL_BASE", "SALESFORCE_USERNAME", "SALESFORCE_PASSWORD"] as const;

// FAIL-SAFE: solo escribe en Salesforce si el server tiene
// SALESFORCE_AUTOLANZAR=REAL. Sin eso, corre en modo SIMULACIÓN (dry-run):
// resuelve y avisa qué lanzaría, pero NO toca Mined. Lee process.env y, si no
// está, el .env del server como respaldo (Next no siempre carga el .env).
function leerConfigServer(clave: string): string {
  if (process.env[clave]) return String(process.env[clave]);
  try {
    const envPath = path.join(process.env.APP_DIR || "/var/www/carrot", ".env");
    const m = readFileSync(envPath, "utf8").match(new RegExp(`^${clave}=(.*)$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  } catch { /* no existe / no legible */ }
  return "";
}

function modoReal(): boolean {
  return leerConfigServer("SALESFORCE_AUTOLANZAR").trim().toUpperCase() === "REAL";
}

function envConCredenciales(): NodeJS.ProcessEnv | null {
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
  if (CREDS.some((k) => !env[k])) return null;
  return env;
}

function extraerNI(incidencias: string | null | undefined): string | null {
  const m = (incidencias || "").match(/NI-\d+/i);
  return m ? m[0].toUpperCase() : null;
}

async function avisar(actorId: string, titulo: string, mensaje: string, predioId: string) {
  try {
    await enviarPushYBandeja(actorId, {
      tipo: "salesforce_lanzar",
      titulo,
      mensaje,
      enlace: `/dashboard/tareas?predio=${predioId}`,
      entidad: "PREDIO",
      entidadId: predioId,
      tag: `sf-lanzar-${predioId}`,
    });
  } catch (e) {
    console.error("[SF-lanzar] no se pudo notificar:", e);
  }
}

interface ResultadoPython {
  ok: boolean;
  estado: string;
  error?: string;
  ni?: string;
  lacm_nombre?: string;
  lacm_estado?: string;
  orden_trabajo_actual?: string;
  laceq_nombre?: string;
  total_lacm?: number;
  instalador?: string;
  [k: string]: any;
}

function ejecutarPython(env: NodeJS.ProcessEnv, ni: string, thnet: string, dry: boolean): Promise<ResultadoPython> {
  return new Promise((resolve) => {
    const args = [SCRIPT, ni, thnet];
    if (dry) args.push("--dry-run");
    const proc = spawn(EXTRACTOR_PYTHON, args, { cwd: EXTRACTOR_DIR, env });
    let stdout = "";
    let stderrTail = "";
    const timer = setTimeout(() => {
      try { proc.kill("SIGKILL"); } catch { /* noop */ }
    }, 240_000);
    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-1500); });
    proc.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, estado: "SPAWN_ERROR", error: String(e).slice(0, 200) });
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      const lineas = stdout.split("\n").filter((l) => l.includes("RESULT_JSON:"));
      const ultima = lineas[lineas.length - 1];
      if (ultima) {
        try {
          resolve(JSON.parse(ultima.slice(ultima.indexOf("RESULT_JSON:") + "RESULT_JSON:".length).trim()));
          return;
        } catch { /* cae abajo */ }
      }
      resolve({ ok: false, estado: "SIN_RESULTADO", error: `código ${code}. ${stderrTail.trim().slice(-300)}` });
    });
  });
}

/**
 * Auto-lanza un predio en Salesforce/Mined al pasar a EN PROGRESO desde
 * admin/mesa. Resuelve el usuario THNET a partir del técnico asignado (mapeo
 * salesforceUser) y la NI a partir de predio.incidencias, y dispara el script
 * Python. Fire-and-forget: nunca lanza; siempre notifica al actor el resultado.
 * En modo SIMULACIÓN (default, sin SALESFORCE_AUTOLANZAR=REAL) no escribe en Mined.
 */
export async function lanzarPredioEnSalesforce(opts: { predioId: string; actorId: string }): Promise<void> {
  const { predioId, actorId } = opts;
  try {
    const predio = await prisma.predio.findUnique({
      where: { id: predioId },
      select: {
        id: true, codigo: true, incidencias: true,
        asignaciones: { select: { usuario: { select: { id: true, nombre: true, salesforceUser: true } } } },
      },
    });
    if (!predio) return;
    const cod = predio.codigo || predioId;

    const ni = extraerNI(predio.incidencias);
    if (!ni) {
      await avisar(actorId, "No se pudo auto-lanzar", `Predio ${cod}: no tiene NI/incidencia cargada. Cargá la incidencia y volvé a pasarlo a EN PROGRESO.`, predioId);
      return;
    }

    const conSf = predio.asignaciones
      .map((a) => a.usuario)
      .filter((u): u is { id: string; nombre: string; salesforceUser: string } => !!u?.salesforceUser);
    const distintos = Array.from(new Set(conSf.map((u) => u.salesforceUser)));
    if (distintos.length === 0) {
      await avisar(actorId, "No se pudo auto-lanzar", `Predio ${cod} (${ni}): el técnico asignado no tiene usuario de Salesforce mapeado. Asignalo en Administración → Usuarios Salesforce.`, predioId);
      return;
    }
    if (distintos.length > 1) {
      await avisar(actorId, "No se pudo auto-lanzar", `Predio ${cod} (${ni}): hay varios técnicos con usuario Salesforce asignados (${distintos.join(", ")}). No sé cuál lanzar; dejá uno solo.`, predioId);
      return;
    }
    const thnet = distintos[0];

    const env = envConCredenciales();
    if (!env) {
      await avisar(actorId, "No se pudo auto-lanzar", `Predio ${cod} (${ni}): faltan credenciales de Salesforce en el servidor.`, predioId);
      return;
    }

    const dry = !modoReal();
    const r = await ejecutarPython(env, ni, thnet, dry);
    const pre = dry ? "SIMULACIÓN — " : "";

    if (r.ok && (r.estado === "LANZADO")) {
      await avisar(actorId, "Predio lanzado en Salesforce", `Predio ${cod} (${ni}) lanzado a ${thnet}. Cronograma ${r.lacm_nombre} → Orden de Trabajo "Lanzada".`, predioId);
    } else if (r.ok && r.estado === "YA_LANZADO") {
      await avisar(actorId, "Predio ya estaba lanzado", `Predio ${cod} (${ni}): el cronograma ${r.lacm_nombre} ya estaba Lanzada con ${thnet}. No se hizo nada.`, predioId);
    } else if (r.ok && r.estado === "DRY_RUN") {
      const yl = r.ya_lanzado ? " (ya está Lanzada)" : "";
      await avisar(actorId, `${pre}Auto-lanzar predio`, `Predio ${cod} (${ni}): lanzaría el cronograma ${r.lacm_nombre} [${r.lacm_estado}] a ${thnet}${yl}. (Modo simulación: no se escribió en Mined.)`, predioId);
    } else {
      await avisar(actorId, `${pre}No se pudo auto-lanzar`, `Predio ${cod} (${ni}) a ${thnet}: ${r.estado}${r.error ? " — " + r.error : ""}.`, predioId);
    }
    console.info(`[SF-lanzar] predio=${cod} ni=${ni} thnet=${thnet} dry=${dry} -> ${r.estado}`, r.error || "");
  } catch (e) {
    console.error("[SF-lanzar] error inesperado:", e);
    try { await avisar(actorId, "Error al auto-lanzar", `No se pudo auto-lanzar el predio en Salesforce: ${String(e).slice(0, 160)}.`, predioId); } catch { /* noop */ }
  }
}
