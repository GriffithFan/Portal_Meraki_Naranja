"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

/* eslint-disable @typescript-eslint/no-explicit-any */

export default function OperacionPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/operacion/estado", { credentials: "include" });
      if (!res.ok) throw new Error(res.status === 403 ? "Sin permisos para ver este panel" : "No se pudo cargar el estado operativo");
      setData(await res.json());
    } catch (err: any) {
      setError(err.message || "No se pudo cargar el estado operativo");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // ── Administración / mantenimiento ──
  const [backups, setBackups] = useState<any>(null);
  const [errores, setErrores] = useState<any>(null);
  const [logCatalog, setLogCatalog] = useState<any[]>([]);
  const [logView, setLogView] = useState<any>(null);
  const [logFile, setLogFile] = useState<string>("pm2-error");
  const [logErrorsOnly, setLogErrorsOnly] = useState(false);
  const [logLines, setLogLines] = useState(200);
  const [busy, setBusy] = useState<string | null>(null);
  const [adminMsg, setAdminMsg] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try { const r = await fetch("/api/operacion/backups", { credentials: "include" }); if (r.ok) setBackups(await r.json()); } catch { /* noop */ }
  }, []);
  const fetchErrores = useCallback(async () => {
    try { const r = await fetch("/api/operacion/errores?pageSize=50", { credentials: "include" }); if (r.ok) setErrores(await r.json()); } catch { /* noop */ }
  }, []);
  const fetchLogCatalog = useCallback(async () => {
    try { const r = await fetch("/api/operacion/logs", { credentials: "include" }); if (r.ok) { const d = await r.json(); setLogCatalog(d.catalogo || []); } } catch { /* noop */ }
  }, []);
  const fetchLog = useCallback(async (file: string, errorsOnly: boolean, lines: number) => {
    setBusy("log");
    try {
      const r = await fetch(`/api/operacion/logs?file=${encodeURIComponent(file)}&lines=${lines}&errorsOnly=${errorsOnly ? "1" : "0"}`, { credentials: "include" });
      if (r.ok) setLogView(await r.json());
    } catch { /* noop */ } finally { setBusy(null); }
  }, []);

  useEffect(() => { fetchBackups(); fetchErrores(); fetchLogCatalog(); }, [fetchBackups, fetchErrores, fetchLogCatalog]);

  async function doBackup(tipo: "db" | "full") {
    setBusy(`backup-${tipo}`); setAdminMsg(null);
    try {
      const r = await fetch("/api/operacion/backups", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify({ tipo }) });
      const d = await r.json();
      if (r.ok) { setAdminMsg(d.iniciado ? d.mensaje : `Backup de BD creado: ${d.ultimoDb?.name || "ok"}`); await fetchBackups(); }
      else setAdminMsg(d.error || "No se pudo hacer el backup");
    } catch { setAdminMsg("No se pudo hacer el backup"); } finally { setBusy(null); }
  }

  async function purgeErrores(olderThanDays: number) {
    setBusy("purge");
    try {
      const url = olderThanDays > 0 ? `/api/operacion/errores?olderThanDays=${olderThanDays}` : "/api/operacion/errores";
      const r = await fetch(url, { method: "DELETE", credentials: "include" });
      if (r.ok) await fetchErrores();
    } catch { /* noop */ } finally { setBusy(null); }
  }

  if (loading) {
    return (
      <div className="animate-fade-in-up space-y-5">
        <div className="h-7 w-56 bg-surface-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, index) => <div key={index} className="h-28 bg-white border border-surface-200 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-[360px] flex flex-col items-center justify-center text-surface-400">
        <p className="text-sm text-red-500">{error || "Sin datos"}</p>
        <button onClick={fetchData} className="mt-3 text-xs text-primary-600 hover:underline">Reintentar</button>
      </div>
    );
  }

  const issues = [
    { label: "Predios sin estado", value: data.predios.sinEstado, href: "/dashboard/tareas" },
    { label: "Predios sin asignar", value: data.predios.sinAsignar, href: "/dashboard/tareas" },
    { label: "Predios sin GPS", value: data.predios.sinGPS, href: "/dashboard/predios" },
    { label: "Predios sin espacio", value: data.predios.sinEspacio, href: "/dashboard/tareas" },
  ];

  return (
    <div className="animate-fade-in-up space-y-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-surface-800">Estado operativo</h1>
          <p className="text-xs text-surface-400">Lectura rapida de salud, datos incompletos y actividad reciente</p>
        </div>
        <button onClick={fetchData} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat title="Predios" value={data.predios.total} detail={`${data.predios.actualizadosHoy} actualizados hoy`} tone="primary" />
        <Stat title="Stock" value={data.stock.total} detail={`${data.stock.estados.length} estados`} tone="green" />
        <Stat title="Chats activos" value={data.comunicacion.chatsAbiertos + data.comunicacion.chatsEnCurso} detail={`${data.comunicacion.chatsAbiertos} abiertos, ${data.comunicacion.chatsEnCurso} en curso`} tone="blue" />
        <Stat title="Actividad semanal" value={data.operacion.actividadSemana} detail={`${data.operacion.usuariosActivos} usuarios activos`} tone="amber" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Runtime</h2>
          <div className="space-y-2 text-sm">
            <Metric label="Ambiente" value={data.app.runtime.nodeEnv} />
            <Metric label="PID" value={data.app.runtime.pid} />
            <Metric label="Uptime" value={formatDuration(data.app.runtime.uptimeSeconds)} />
            <Metric label="Memoria app" value={`${data.app.runtime.memoryMb} MB`} />
            <Metric label="Heap usado" value={`${data.app.runtime.heapUsedMb} MB`} />
            <Metric label="RAM libre" value={`${data.app.runtime.systemFreeMb} / ${data.app.runtime.systemTotalMb} MB`} />
          </div>
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Disco</h2>
          {data.app.disk.available ? (
            <div className="space-y-2 text-sm">
              <Metric label="Montaje" value={data.app.disk.mount || "-"} />
              <Metric label="Uso" value={`${data.app.disk.usedPercent}%`} tone={data.app.disk.usedPercent >= 85 ? "warn" : "ok"} />
              <Metric label="Libre" value={`${data.app.disk.freeMb} MB`} />
              <div className="h-2 rounded-full bg-surface-100 overflow-hidden">
                <div className={`h-full ${data.app.disk.usedPercent >= 85 ? "bg-amber-500" : "bg-emerald-500"}`} style={{ width: `${Math.min(data.app.disk.usedPercent || 0, 100)}%` }} />
              </div>
            </div>
          ) : (
            <p className="text-sm text-surface-400">{data.app.disk.reason || "No disponible"}</p>
          )}
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Logs PM2</h2>
          <div className="space-y-2">
            {data.app.logs.map((log: any) => (
              <div key={log.name} className="rounded-md border border-surface-100 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium text-surface-700">{log.name}</span>
                  <span className={`text-[11px] ${log.exists ? "text-emerald-600" : "text-surface-400"}`}>{log.exists ? formatSize(log.size) : "No detectado"}</span>
                </div>
                {log.suspicious.length > 0 ? (
                  <p className="text-[11px] text-amber-600 mt-1">{log.suspicious.length} linea(s) con posibles errores</p>
                ) : (
                  <p className="text-[11px] text-surface-400 mt-1">Sin errores recientes detectados</p>
                )}
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Checks HTTP</h2>
          <div className="space-y-2">
            {(data.app.httpChecks || []).map((check: any) => (
              <div key={check.name} className="flex items-center justify-between gap-3 rounded-md border border-surface-100 px-3 py-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-surface-700 truncate">{check.name}</p>
                  <p className="text-[11px] text-surface-400 truncate">{check.url} · {check.latencyMs} ms</p>
                </div>
                <span className={`text-xs font-semibold ${check.ok ? "text-emerald-600" : "text-red-600"}`}>{check.status || "ERR"}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">PM2</h2>
          {data.app.pm2?.available ? (
            <div className="space-y-2">
              {data.app.pm2.processes.map((proc: any) => (
                <div key={proc.name} className="rounded-md border border-surface-100 px-3 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium text-surface-700">{proc.name}</span>
                    <span className={`text-[11px] font-semibold ${proc.status === "online" ? "text-emerald-600" : "text-red-600"}`}>{proc.status}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-surface-400 mt-2">
                    <span>PID: {proc.pid || "-"}</span>
                    <span>CPU: {proc.cpu ?? "-"}%</span>
                    <span>RAM: {proc.memoryMb ?? "-"} MB</span>
                    <span>Reinicios: {proc.restarts}</span>
                    <span className="col-span-2">Uptime: {proc.uptimeMs ? formatDuration(Math.floor(proc.uptimeMs / 1000)) : "-"}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-surface-400">{data.app.pm2?.reason || "No disponible"}</p>
          )}
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Cron y reportes</h2>
          {data.app.cron?.crontab?.available ? (
            <div className="space-y-2">
              {data.app.cron.crontab.entries.length > 0 ? data.app.cron.crontab.entries.map((entry: string) => (
                <p key={entry} className="rounded-md border border-surface-100 px-3 py-2 text-[11px] text-surface-600 break-words">{entry}</p>
              )) : <p className="text-sm text-surface-400">Sin entradas relevantes detectadas.</p>}
            </div>
          ) : (
            <p className="text-sm text-surface-400">{data.app.cron?.crontab?.reason || "No disponible"}</p>
          )}
          <div className="mt-3 rounded-md border border-surface-100 px-3 py-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-surface-700">reportes-cron.log</span>
              <span className={`text-[11px] ${data.app.cron?.reportes?.exists ? "text-emerald-600" : "text-surface-400"}`}>{data.app.cron?.reportes?.exists ? formatSize(data.app.cron.reportes.size) : "No detectado"}</span>
            </div>
            {data.app.cron?.reportes?.modifiedAt && <p className="text-[11px] text-surface-400 mt-1">Ultima actividad: {formatDate(data.app.cron.reportes.modifiedAt)}</p>}
            {data.app.cron?.reportes?.lastLines?.slice(-2).map((line: string, index: number) => (
              <p key={`${index}-${line}`} className="text-[11px] text-surface-500 mt-1 truncate">{line}</p>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Alertas de consistencia</h2>
          <div className="space-y-2">
            {issues.map((item) => (
              <Link key={item.label} href={item.href} className="flex items-center justify-between rounded-md border border-surface-100 px-3 py-2 hover:bg-surface-50">
                <span className="text-sm text-surface-700">{item.label}</span>
                <span className={`text-sm font-semibold ${item.value > 0 ? "text-amber-600" : "text-emerald-600"}`}>{item.value}</span>
              </Link>
            ))}
            {data.predios.duplicadosCue.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2">
                <p className="text-xs font-medium text-amber-700 mb-1">CUE duplicados detectados</p>
                <div className="flex flex-wrap gap-1">
                  {data.predios.duplicadosCue.map((item: any) => (
                    <span key={item.cue} className="text-[11px] bg-white border border-amber-200 rounded px-2 py-0.5 text-amber-700">{item.cue}: {item.count}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="bg-white border border-surface-200 rounded-lg p-4">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Backups</h2>
          {data.backups.configured ? (
            <div className="rounded-md border border-surface-100 p-3">
              <p className="text-sm text-surface-700">Backups encontrados: <span className="font-semibold">{data.backups.count}</span></p>
              {data.backups.latest ? (
                <div className="text-xs text-surface-400 mt-1 space-y-1">
                  <p>Ultimo: {data.backups.latest.name} · {formatDate(data.backups.latest.modifiedAt)}</p>
                  <p>Ruta: {data.backups.path || "-"} · Total: {formatSize(data.backups.totalSize || 0)}</p>
                </div>
              ) : (
                <p className="text-xs text-amber-600 mt-1">Carpeta encontrada pero sin backups generados.</p>
              )}
            </div>
          ) : (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm text-amber-700">No hay carpeta de backups local detectada.</p>
              <p className="text-xs text-amber-600 mt-1">Usar scripts/backup-production.sh en el VPS para generar el primer backup manual.</p>
            </div>
          )}

          <h3 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mt-4 mb-2">Stock por estado</h3>
          <div className="space-y-1.5">
            {data.stock.estados.slice(0, 8).map((item: any) => (
              <div key={item.estado} className="flex items-center justify-between text-sm">
                <span className="text-surface-600">{item.estado}</span>
                <span className="font-semibold text-surface-800">{item.cantidad}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Actividad reciente</h2>
        <div className="divide-y divide-surface-100">
          {data.actividadReciente.map((item: any) => (
            <div key={item.id} className="py-2 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm text-surface-800">{item.descripcion || `${item.accion} en ${item.entidad}`}</p>
                <p className="text-[11px] text-surface-400">{item.usuario?.nombre} · {item.entidad}</p>
              </div>
              <span className="text-[11px] text-surface-400 shrink-0">{formatDate(item.createdAt)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ── Backups y mantenimiento ── */}
      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Backups y mantenimiento</h2>
          <div className="flex items-center gap-2">
            <button disabled={!!busy} onClick={() => doBackup("db")} className="px-3 py-1.5 text-xs rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50">{busy === "backup-db" ? "Generando..." : "Backup BD ahora"}</button>
            <button disabled={!!busy} onClick={() => doBackup("full")} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50 disabled:opacity-50">{busy === "backup-full" ? "Iniciando..." : "Backup completo"}</button>
          </div>
        </div>
        {backups?.schedule?.configurado && backups.schedule.hora && (
          <p className="text-xs text-surface-500 mb-2">Backup automático diario a las <b>{backups.schedule.hora}</b>{backups.schedule.proximaCorrida ? ` · próxima: ${formatDate(backups.schedule.proximaCorrida)}` : ""}.</p>
        )}
        {adminMsg && <p className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2 mb-2">{adminMsg}</p>}
        <div className="rounded-md border border-amber-100 bg-amber-50 px-3 py-2 mb-3">
          <p className="text-[11px] text-amber-700">Restaurar reemplaza datos y se hace por consola con asistencia (evitamos un botón que pueda pisar toda la base). Descargá el backup que necesites y coordinamos la restauración.</p>
        </div>
        <div className="max-h-72 overflow-y-auto divide-y divide-surface-100">
          {(backups?.backups || []).length === 0 && <p className="text-sm text-surface-400 py-2">Sin backups todavía.</p>}
          {(backups?.backups || []).map((b: any) => (
            <div key={b.name} className="py-2 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm text-surface-800 truncate font-mono">{b.name}</p>
                <p className="text-[11px] text-surface-400">{b.tipo === "uploads" ? "Archivos" : "Base de datos"} · {formatSize(b.size)} · {formatDate(b.modifiedAt)}</p>
              </div>
              <a href={`/api/operacion/backups/download?name=${encodeURIComponent(b.name)}`} className="shrink-0 px-2.5 py-1 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Descargar</a>
            </div>
          ))}
        </div>
      </section>

      {/* ── Visor de logs del VPS ── */}
      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider mb-3">Visor de logs del VPS</h2>
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <select value={logFile} onChange={(e) => setLogFile(e.target.value)} className="text-xs border border-surface-200 rounded-md px-2 py-1.5">
            {logCatalog.map((c) => <option key={c.key} value={c.key} disabled={!c.exists}>{c.label}{c.exists ? "" : " (no disponible)"}</option>)}
          </select>
          <select value={logLines} onChange={(e) => setLogLines(parseInt(e.target.value))} className="text-xs border border-surface-200 rounded-md px-2 py-1.5">
            {[100, 200, 500, 1000].map((n) => <option key={n} value={n}>{n} líneas</option>)}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-surface-600"><input type="checkbox" checked={logErrorsOnly} onChange={(e) => setLogErrorsOnly(e.target.checked)} /> Solo errores</label>
          <button disabled={busy === "log"} onClick={() => fetchLog(logFile, logErrorsOnly, logLines)} className="px-3 py-1.5 text-xs rounded-md bg-surface-800 text-white hover:bg-surface-700 disabled:opacity-50">{busy === "log" ? "Cargando..." : "Ver"}</button>
        </div>
        {logView && (
          <div>
            <p className="text-[11px] text-surface-400 mb-1">{logView.label} · {logView.lines?.length || 0} línea(s){logView.size ? ` · ${formatSize(logView.size)}` : ""}{logView.modifiedAt ? ` · ${formatDate(logView.modifiedAt)}` : ""}{logView.error ? ` · ${logView.error}` : ""}</p>
            <pre className="text-[11px] leading-relaxed bg-surface-900 text-surface-100 rounded-md p-3 max-h-96 overflow-auto whitespace-pre-wrap break-words">{(logView.lines || []).join("\n") || "(sin líneas)"}</pre>
          </div>
        )}
      </section>

      {/* ── Errores de la página ── */}
      <section className="bg-white border border-surface-200 rounded-lg p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
          <h2 className="text-xs font-semibold text-surface-500 uppercase tracking-wider">Errores de la página</h2>
          <div className="flex items-center gap-2">
            <button onClick={() => fetchErrores()} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-600 hover:bg-surface-50">Actualizar</button>
            <button disabled={busy === "purge"} onClick={() => purgeErrores(7)} className="px-3 py-1.5 text-xs rounded-md border border-surface-200 text-surface-500 hover:bg-surface-50 disabled:opacity-50">Limpiar +7 días</button>
          </div>
        </div>
        {errores?.resumen && (
          <div className="flex flex-wrap gap-3 mb-3 text-xs">
            <span className="rounded-md bg-surface-50 border border-surface-100 px-2.5 py-1">Últimas 24h: <b className={errores.resumen.ultimas24h > 0 ? "text-red-600" : "text-emerald-600"}>{errores.resumen.ultimas24h}</b></span>
            <span className="rounded-md bg-surface-50 border border-surface-100 px-2.5 py-1">Servidor: <b>{errores.resumen.totalServer}</b></span>
            <span className="rounded-md bg-surface-50 border border-surface-100 px-2.5 py-1">Cliente: <b>{errores.resumen.totalCliente}</b></span>
            <span className="rounded-md bg-surface-50 border border-surface-100 px-2.5 py-1">Total: <b>{errores.total}</b></span>
          </div>
        )}
        <div className="max-h-96 overflow-y-auto divide-y divide-surface-100">
          {(errores?.items || []).length === 0 && <p className="text-sm text-surface-400 py-2">Sin errores registrados. 🎉</p>}
          {(errores?.items || []).map((e: any) => (
            <details key={e.id} className="py-2">
              <summary className="cursor-pointer list-none flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-surface-800 truncate">{e.mensaje}</p>
                  <p className="text-[11px] text-surface-400">
                    <span className={`font-semibold ${e.origen === "CLIENTE" ? "text-purple-600" : "text-red-600"}`}>{e.origen}</span>
                    {e.ruta ? ` · ${e.metodo || ""} ${e.ruta}` : ""}{e.userNombre ? ` · ${e.userNombre}` : ""}
                  </p>
                </div>
                <span className="text-[11px] text-surface-400 shrink-0">{formatDate(e.createdAt)}</span>
              </summary>
              {e.stack && <pre className="mt-2 text-[10px] leading-relaxed bg-surface-50 border border-surface-100 rounded-md p-2 max-h-48 overflow-auto whitespace-pre-wrap break-words text-surface-600">{e.stack}</pre>}
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}

function Stat({ title, value, detail, tone }: { title: string; value: number; detail: string; tone: "primary" | "green" | "blue" | "amber" }) {
  const tones = {
    primary: "text-primary-600 bg-primary-50",
    green: "text-emerald-600 bg-emerald-50",
    blue: "text-blue-600 bg-blue-50",
    amber: "text-amber-600 bg-amber-50",
  };
  return (
    <div className="bg-white border border-surface-200 rounded-lg p-4">
      <p className="text-xs text-surface-400 mb-2">{title}</p>
      <div className={`inline-flex rounded-md px-2 py-1 ${tones[tone]}`}>
        <span className="text-2xl font-semibold tabular-nums">{value}</span>
      </div>
      <p className="text-xs text-surface-500 mt-2">{detail}</p>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string | number; tone?: "ok" | "warn" }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-surface-500">{label}</span>
      <span className={`font-medium text-right ${tone === "warn" ? "text-amber-600" : tone === "ok" ? "text-emerald-600" : "text-surface-800"}`}>{value}</span>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString("es-AR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function formatDuration(seconds: number) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatSize(bytes: number) {
  if (!bytes) return "0 B";
  const mb = bytes / 1024 / 1024;
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}
