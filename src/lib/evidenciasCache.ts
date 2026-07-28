import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import AdmZip from "adm-zip";
import { mkdir, readdir, writeFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Los ZIP se descomprimen a una cache en disco (se re-genera solo si hace falta;
// el ZIP original queda en uploads/chat). Un cron limpia lo viejo.
export const CACHE_BASE = path.resolve(process.cwd(), "uploads", "evidencias-cache");
const MAX_TOTAL = 800 * 1024 * 1024; // tope anti zip-bomb
const OK_EXT = new Set([".jpg", ".jpeg", ".png", ".heic", ".xml", ".json"]);

interface AuthOk { zipPath: string; nombre: string; error?: undefined }
interface AuthErr { error: NextResponse; zipPath?: undefined; nombre?: undefined }

/** Verifica que el usuario tenga acceso al adjunto (mensaje de chat) y que sea un ZIP. */
export async function autorizarArchivoChat(archivoId: string, session: { userId: string }): Promise<AuthOk | AuthErr> {
  const mensaje = await prisma.chatMensaje.findUnique({
    where: { id: archivoId },
    select: { archivoUrl: true, archivoNombre: true, conversacion: { select: { creadorId: true, agenteId: true } } },
  });
  if (!mensaje?.archivoUrl) return { error: NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 }) };
  if (!/\.zip$/i.test(mensaje.archivoNombre || "")) return { error: NextResponse.json({ error: "El adjunto no es un ZIP" }, { status: 400 }) };

  const user = await prisma.user.findUnique({ where: { id: session.userId }, select: { esMesa: true } });
  const ok = mensaje.conversacion.creadorId === session.userId || mensaje.conversacion.agenteId === session.userId || user?.esMesa === true;
  if (!ok) return { error: NextResponse.json({ error: "Sin acceso" }, { status: 403 }) };

  const uploadsDir = path.resolve(process.cwd(), "uploads");
  const zipPath = path.resolve(process.cwd(), mensaje.archivoUrl.replace(/^\/+/, ""));
  if (!zipPath.startsWith(uploadsDir)) return { error: NextResponse.json({ error: "Ruta no permitida" }, { status: 403 }) };
  return { zipPath, nombre: mensaje.archivoNombre || "evidencias.zip" };
}

/** Descomprime el ZIP a la cache (si no está ya) y devuelve la carpeta. */
export async function asegurarCacheEvidencias(archivoId: string, zipPath: string): Promise<string> {
  const cacheDir = path.join(CACHE_BASE, archivoId);
  if (existsSync(cacheDir)) {
    try { if ((await readdir(cacheDir)).length > 0) return cacheDir; } catch { /* re-extraer */ }
  }
  await mkdir(cacheDir, { recursive: true });
  const zip = new AdmZip(zipPath);
  let total = 0;
  for (const entry of zip.getEntries()) {
    if (entry.isDirectory) continue;
    const ext = path.extname(entry.entryName).toLowerCase();
    if (!OK_EXT.has(ext)) continue;
    const target = path.resolve(cacheDir, entry.entryName);
    if (!(target === cacheDir || target.startsWith(cacheDir + path.sep))) continue; // anti zip-slip
    const data = entry.getData();
    total += data.length;
    if (total > MAX_TOTAL) throw new Error("El paquete supera el tamaño permitido");
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, data);
  }
  return cacheDir;
}

/** Resuelve la ruta absoluta de una foto de la cache, validando que no escape la carpeta. */
export function resolverFotoEvidencia(archivoId: string, rel: string): string | null {
  const cacheDir = path.join(CACHE_BASE, archivoId);
  const target = path.resolve(cacheDir, rel);
  if (target === cacheDir || target.startsWith(cacheDir + path.sep)) return target;
  return null;
}
