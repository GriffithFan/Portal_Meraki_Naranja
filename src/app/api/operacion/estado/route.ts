import { NextResponse } from "next/server";
import { execFile } from "child_process";
import { readdir, readFile, stat } from "fs/promises";
import os from "os";
import { join } from "path";
import { promisify } from "util";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

const execFileAsync = promisify(execFile);

type Pm2Process = {
  name?: string;
  pid?: number;
  pm2_env?: { status?: string; restart_time?: number; pm_uptime?: number };
  monit?: { memory?: number; cpu?: number };
};

export async function GET(request: Request) {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol)) {
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  }

  const now = new Date();
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - 7);

  const [
    prediosTotal,
    prediosSinEstado,
    prediosSinEquipo,
    prediosSinGPS,
    prediosSinEspacio,
    usuariosActivos,
    chatsAbiertos,
    chatsEnCurso,
    notificacionesPendientes,
    actividadSemana,
    equiposPorEstado,
    prediosActualizadosHoy,
    cueGroups,
    actividadReciente,
  ] = await Promise.all([
    prisma.predio.count(),
    prisma.predio.count({ where: { estadoId: null } }),
    prisma.predio.count({ where: { OR: [{ equipoAsignado: null }, { equipoAsignado: "" }] } }),
    prisma.predio.count({
      where: {
        AND: [
          { OR: [{ gpsPredio: null }, { gpsPredio: "" }] },
          { OR: [{ latitud: null }, { longitud: null }] },
        ],
      },
    }),
    prisma.predio.count({ where: { espacioId: null } }),
    prisma.user.count({ where: { activo: true } }),
    safeCount(prisma.chatConversacion.count({ where: { estado: "ABIERTA" } })),
    safeCount(prisma.chatConversacion.count({ where: { estado: "EN_CURSO" } })),
    prisma.notificacion.count({ where: { leida: false } }),
    prisma.actividad.count({ where: { createdAt: { gte: startOfWeek } } }),
    prisma.equipo.groupBy({ by: ["estado"], _sum: { cantidad: true }, _count: { _all: true } }),
    prisma.predio.count({ where: { updatedAt: { gte: startOfDay } } }),
    prisma.predio.groupBy({
      by: ["cue"],
      where: { cue: { not: null } },
      _count: { _all: true },
      having: { cue: { _count: { gt: 1 } } },
      orderBy: { _count: { cue: "desc" } },
      take: 10,
    }),
    prisma.actividad.findMany({
      orderBy: { createdAt: "desc" },
      take: 6,
      select: {
        id: true,
        accion: true,
        descripcion: true,
        entidad: true,
        createdAt: true,
        usuario: { select: { nombre: true, rol: true } },
      },
    }),
  ]);

  const stockTotal = equiposPorEstado.reduce((sum, item) => sum + (item._sum.cantidad || item._count._all), 0);
  const stockEstados = equiposPorEstado
    .map((item) => ({ estado: item.estado || "Sin estado", cantidad: item._sum.cantidad || item._count._all }))
    .sort((a, b) => b.cantidad - a.cantidad);

  const [backups, runtime, disk, logs, httpChecks, pm2, cron] = await Promise.all([
    getBackupSummary(),
    getRuntimeSummary(),
    getDiskSummary(),
    getLogSummary(),
    getHttpChecks(request),
    getPm2Summary(),
    getCronSummary(),
  ]);
  const duplicadosCue = cueGroups
    .filter((item) => item.cue && item.cue.trim() !== "")
    .map((item) => ({ cue: item.cue, count: item._count._all }));

  return NextResponse.json({
    generatedAt: now.toISOString(),
    app: { ok: true, commit: process.env.VERCEL_GIT_COMMIT_SHA || null, runtime, disk, logs, httpChecks, pm2, cron },
    predios: {
      total: prediosTotal,
      actualizadosHoy: prediosActualizadosHoy,
      sinEstado: prediosSinEstado,
      sinEquipo: prediosSinEquipo,
      sinGPS: prediosSinGPS,
      sinEspacio: prediosSinEspacio,
      duplicadosCue,
    },
    stock: { total: stockTotal, estados: stockEstados },
    comunicacion: { chatsAbiertos, chatsEnCurso, notificacionesPendientes },
    operacion: { usuariosActivos, actividadSemana },
    backups,
    actividadReciente,
  });
}

async function safeCount(promise: Promise<number>) {
  try {
    return await promise;
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "P2021") return 0;
    throw error;
  }
}

async function getBackupSummary() {
  const candidates = [join(process.cwd(), "backups"), "/opt/backups"];

  for (const backupDir of candidates) {
    const summary = await readBackupDir(backupDir);
    if (summary.configured) return summary;
  }

  return { configured: false, path: null, count: 0, latest: null, totalSize: 0 };
}

async function readBackupDir(backupDir: string) {
  try {
    const files = await readdir(backupDir);
    const details = await Promise.all(
      files
        .filter((name) => name.endsWith(".gz") || name.endsWith(".tar.gz"))
        .map(async (name) => {
          const info = await stat(join(backupDir, name));
          return { name, size: info.size, modifiedAt: info.mtime.toISOString() };
        })
    );
    const sorted = details.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime());
    return {
      configured: true,
      path: backupDir,
      count: sorted.length,
      latest: sorted[0] || null,
      totalSize: sorted.reduce((sum, item) => sum + item.size, 0),
    };
  } catch {
    return { configured: false, path: backupDir, count: 0, latest: null, totalSize: 0 };
  }
}

async function getRuntimeSummary() {
  const memory = process.memoryUsage();
  return {
    nodeEnv: process.env.NODE_ENV || "development",
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    memoryMb: Math.round(memory.rss / 1024 / 1024),
    heapUsedMb: Math.round(memory.heapUsed / 1024 / 1024),
    systemFreeMb: Math.round(os.freemem() / 1024 / 1024),
    systemTotalMb: Math.round(os.totalmem() / 1024 / 1024),
  };
}

async function getDiskSummary() {
  if (process.platform === "win32") return { available: false, reason: "No disponible en Windows local" };

  try {
    const { stdout } = await execFileAsync("df", ["-k", process.cwd()]);
    const [, line] = stdout.trim().split("\n");
    const parts = line?.trim().split(/\s+/) || [];
    const totalKb = Number(parts[1] || 0);
    const usedKb = Number(parts[2] || 0);
    const freeKb = Number(parts[3] || 0);
    const usedPercent = totalKb > 0 ? Math.round((usedKb / totalKb) * 100) : null;
    return {
      available: true,
      mount: parts[5] || null,
      totalMb: Math.round(totalKb / 1024),
      usedMb: Math.round(usedKb / 1024),
      freeMb: Math.round(freeKb / 1024),
      usedPercent,
    };
  } catch {
    return { available: false, reason: "No se pudo leer df" };
  }
}

async function getLogSummary() {
  const files = [
    join(process.cwd(), "logs", "pm2-error.log"),
    join(process.cwd(), "logs", "pm2-out.log"),
    join(process.cwd(), "logs", "reportes-cron.log"),
  ];
  const results = await Promise.all(files.map(readLogFile));
  return results;
}

async function getHttpChecks(request: Request) {
  const origin = new URL(request.url).origin;
  const checks = [
    { name: "Health", url: `${origin}/api/health`, expected: [200] },
    { name: "Login", url: `${origin}/login`, expected: [200] },
    { name: "Cron protegido", url: `${origin}/api/cron/reportes?tipo=diario&dryRun=true`, expected: [401] },
  ];

  return Promise.all(checks.map(runHttpCheck));
}

async function runHttpCheck(check: { name: string; url: string; expected: number[] }) {
  const startedAt = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(check.url, { cache: "no-store", redirect: "manual", signal: controller.signal });
    const latencyMs = Date.now() - startedAt;
    return {
      name: check.name,
      status: response.status,
      ok: check.expected.includes(response.status),
      latencyMs,
      url: new URL(check.url).pathname,
      expected: check.expected,
    };
  } catch (error) {
    return {
      name: check.name,
      status: null,
      ok: false,
      latencyMs: Date.now() - startedAt,
      url: new URL(check.url).pathname,
      expected: check.expected,
      error: error instanceof Error ? error.message : "Error desconocido",
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function getPm2Summary() {
  if (process.platform === "win32") return { available: false, reason: "No disponible en Windows local", processes: [] };

  try {
    const { stdout } = await execFileAsync("pm2", ["jlist"], { timeout: 5000 });
    const processes = (JSON.parse(stdout) as Pm2Process[]).map((item) => ({
      name: item.name,
      pid: item.pid || null,
      status: item.pm2_env?.status || "unknown",
      restarts: item.pm2_env?.restart_time || 0,
      uptimeMs: item.pm2_env?.pm_uptime ? Date.now() - item.pm2_env.pm_uptime : null,
      memoryMb: item.monit?.memory ? Math.round(item.monit.memory / 1024 / 1024) : null,
      cpu: item.monit?.cpu ?? null,
    }));
    return { available: true, processes };
  } catch (error) {
    return { available: false, reason: error instanceof Error ? error.message : "No se pudo leer PM2", processes: [] };
  }
}

async function getCronSummary() {
  const reportLog = join(process.cwd(), "logs", "reportes-cron.log");
  const [crontab, reportes] = await Promise.all([readCrontab(), readLogFile(reportLog)]);
  return { crontab, reportes };
}

async function readCrontab() {
  if (process.platform === "win32") return { available: false, entries: [], reason: "No disponible en Windows local" };

  try {
    const { stdout } = await execFileAsync("crontab", ["-l"], { timeout: 5000 });
    const entries = stdout
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith("#"))
      .filter((line) => /cron|reportes|backup/i.test(line));
    return { available: true, entries };
  } catch (error) {
    return { available: false, entries: [], reason: error instanceof Error ? error.message : "No se pudo leer crontab" };
  }
}

async function readLogFile(filePath: string) {
  const name = filePath.split(/[\\/]/).pop() || filePath;
  try {
    const info = await stat(filePath);
    const content = await readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/).filter(Boolean);
    const suspicious = lines
      .filter((line) => /error|failed|exception|eaddrinuse|prisma|timeout/i.test(line))
      .slice(-5);
    return {
      name,
      exists: true,
      size: info.size,
      modifiedAt: info.mtime.toISOString(),
      lastLines: lines.slice(-5),
      suspicious,
    };
  } catch {
    return { name, exists: false, size: 0, modifiedAt: null, lastLines: [], suspicious: [] };
  }
}
