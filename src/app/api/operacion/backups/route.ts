import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import { execFile, spawn } from "child_process";
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { promisify } from "util";

/* eslint-disable @typescript-eslint/no-explicit-any */

const execFileAsync = promisify(execFile);
const BACKUP_DIR = join(process.cwd(), "backups");

async function listBackups() {
  try {
    const files = await readdir(BACKUP_DIR);
    const details = await Promise.all(
      files
        .filter((n) => n.endsWith(".gz"))
        .map(async (name) => {
          const info = await stat(join(BACKUP_DIR, name));
          return {
            name,
            size: info.size,
            modifiedAt: info.mtime.toISOString(),
            tipo: name.startsWith("uploads-") ? "uploads" : "db",
          };
        })
    );
    return details.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
  } catch {
    return [];
  }
}

// Lee el crontab y arma el horario del backup diario + próxima corrida.
async function getBackupSchedule() {
  if (process.platform === "win32") return { available: false, reason: "No disponible en local" };
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"], { timeout: 5000 });
    const line = stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => l && !l.startsWith("#") && /backup/i.test(l));
    if (!line) return { available: true, configurado: false };
    const parts = line.split(/\s+/);
    const min = parseInt(parts[0], 10);
    const hour = parseInt(parts[1], 10);
    if (Number.isNaN(min) || Number.isNaN(hour)) return { available: true, configurado: true, expresion: line, hora: null, proximaCorrida: null };
    const now = new Date();
    const next = new Date(now);
    next.setHours(hour, min, 0, 0);
    if (next <= now) next.setDate(next.getDate() + 1);
    const hh = String(hour).padStart(2, "0");
    const mm = String(min).padStart(2, "0");
    return { available: true, configurado: true, hora: `${hh}:${mm}`, proximaCorrida: next.toISOString(), expresion: parts.slice(0, 5).join(" ") };
  } catch (e: any) {
    return { available: false, reason: e?.message || "No se pudo leer crontab" };
  }
}

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }
  const [backups, schedule] = await Promise.all([listBackups(), getBackupSchedule()]);
  const dbBackups = backups.filter((b) => b.tipo === "db");
  return NextResponse.json({
    backups,
    schedule,
    totalSize: backups.reduce((s, b) => s + b.size, 0),
    ultimoDb: dbBackups[0] || null,
  });
}

// POST → backup manual. body: { tipo: "db" | "full" }
export async function POST(request: Request) {
  const session = await getSession();
  if (!session || !isAdmin(session.rol)) {
    return NextResponse.json({ error: "Solo administradores" }, { status: 403 });
  }
  if (process.platform === "win32") {
    return NextResponse.json({ error: "No disponible en entorno local (solo VPS)" }, { status: 400 });
  }

  let tipo = "db";
  try { const body = await request.json(); if (body?.tipo === "full") tipo = "full"; } catch { /* default db */ }

  await prisma.actividad.create({
    data: {
      accion: "CREAR", entidad: "BACKUP", entidadId: "manual",
      descripcion: `Backup manual (${tipo === "full" ? "completo: BD + uploads" : "solo BD"}) iniciado por ${session.nombre}`,
      userId: session.userId, metadata: { tipo, manual: true },
    },
  }).catch(() => {});

  if (tipo === "full") {
    // El backup completo incluye el tar de uploads (lento) → en segundo plano.
    const child = spawn("bash", ["scripts/backup-production.sh"], { cwd: process.cwd(), env: process.env, detached: true, stdio: "ignore" });
    child.unref();
    return NextResponse.json({ ok: true, tipo, iniciado: true, mensaje: "Backup completo iniciado en segundo plano. Actualizá la lista en un minuto." });
  }

  // Backup solo de BD: rápido, esperamos el resultado.
  try {
    const { stdout, stderr } = await execFileAsync("bash", ["scripts/backup-production.sh"], {
      cwd: process.cwd(),
      env: { ...process.env, DB_ONLY: "1" },
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    });
    const out = (stdout + "\n" + stderr).trim().split(/\r?\n/).slice(-8);
    const backups = await listBackups();
    return NextResponse.json({ ok: true, tipo, salida: out, ultimoDb: backups.find((b) => b.tipo === "db") || null });
  } catch (e: any) {
    return NextResponse.json({ error: `Falló el backup: ${e?.message || "desconocido"}` }, { status: 500 });
  }
}
