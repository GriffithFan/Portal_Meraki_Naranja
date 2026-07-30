import { spawn } from "child_process";
import { readFileSync } from "fs";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Infra de actas en el VPS (fuera del repo, gitignored, igual que el extractor):
// carpeta con `generar_acta_uno.py` + `Script_para_llenar_actas.py` + el template Word.
const ACTAS_GEN_DIR = process.env.ACTAS_GEN_DIR || "/var/www/carrot/actas-gen";
const ACTAS_PYTHON =
  process.env.ACTAS_PYTHON ||
  process.env.EXTRACTOR_PYTHON ||
  path.join(process.env.EXTRACTOR_DIR || "/var/www/carrot/extractor", ".venv/bin/python");
const ACTAS_SCRIPT = "generar_acta_uno.py";
const CREDS = ["SALESFORCE_URL_BASE", "SALESFORCE_USERNAME", "SALESFORCE_PASSWORD"] as const;

export interface ResultadoActa {
  ok: boolean;
  error?: string;
  predio?: string;
  incidencia?: string;
  recordId?: string;
  docx?: string; // ruta absoluta del .docx en el VPS
  nombreArchivo?: string;
  establecimiento?: string;
  cue?: string;
}

/**
 * Env para el subproceso con las credenciales de Salesforce garantizadas: usa
 * process.env y, si falta alguna, la lee del .env del servidor como respaldo
 * (mismo patrón que el extractor). No lanza: el script Python igual tiene un
 * fallback interno, pero preferimos pasarle las credenciales del servidor.
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
    } catch {
      /* el Python resuelve con su fallback si hace falta */
    }
  }
  return env;
}

/** Extrae el último `RESULT_JSON: {...}` del stdout del script. */
function parsearResultado(salida: string): ResultadoActa | null {
  const re = /RESULT_JSON:\s*(\{.*\})\s*$/gm;
  let m: RegExpExecArray | null;
  let ultimo: string | null = null;
  while ((m = re.exec(salida)) !== null) {
    ultimo = m[1];
  }
  if (!ultimo) return null;
  try {
    return JSON.parse(ultimo) as ResultadoActa;
  } catch {
    return null;
  }
}

/**
 * Corre `generar_acta_uno.py` en el VPS (Selenium + Chrome headless + python-docx)
 * para un predio y devuelve la ruta del .docx generado. El script resuelve el id
 * de Salesforce a partir del número de predio, extrae los campos y llena el
 * template Word. La sesión de Salesforce se reusa vía cookie-cache (arranque tibio).
 */
export function generarActaPredio(predio: string, incidencia?: string): Promise<ResultadoActa> {
  const env = envConCredenciales();
  const args = [ACTAS_SCRIPT, predio];
  if (incidencia) args.push(incidencia);

  return new Promise((resolve) => {
    let proc;
    try {
      proc = spawn(ACTAS_PYTHON, args, { cwd: ACTAS_GEN_DIR, env });
    } catch (e) {
      resolve({ ok: false, error: `No se pudo lanzar el generador: ${(e as Error).message}` });
      return;
    }

    let stdout = "";
    let stderrTail = "";
    let finalizado = false;
    const finalizar = (r: ResultadoActa) => {
      if (finalizado) return;
      finalizado = true;
      clearTimeout(timer);
      resolve(r);
    };

    const timer = setTimeout(() => {
      try { proc!.kill("SIGTERM"); } catch { /* ya muerto */ }
      finalizar({ ok: false, error: "La generación del acta tardó demasiado (timeout). Probá de nuevo." });
    }, 150000);

    proc.stdout.on("data", (c: Buffer) => { stdout += c.toString(); });
    proc.stderr.on("data", (c: Buffer) => { stderrTail = (stderrTail + c.toString()).slice(-2000); });
    proc.on("error", (e) => finalizar({ ok: false, error: `No se pudo lanzar el generador: ${e.message}` }));
    proc.on("close", () => {
      const r = parsearResultado(stdout);
      if (r) finalizar(r);
      else finalizar({ ok: false, error: `El generador no devolvió resultado. ${stderrTail.trim().slice(-300)}`.trim() });
    });
  });
}
