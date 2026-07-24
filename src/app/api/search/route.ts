import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isModOrAdmin } from "@/lib/auth";

export const dynamic = "force-dynamic";

/* eslint-disable @typescript-eslint/no-explicit-any */

type Resultado = {
  tipo: "predio" | "acta" | "usuario" | "instructivo";
  id: string;
  titulo: string;
  subtitulo?: string;
  href: string;
};

const POR_TIPO = 6;

// Búsqueda global (Cmd/Ctrl+K). Busca en predios, actas, usuarios e instructivos,
// respetando permisos: predios y usuarios solo para moderador/admin (los técnicos
// no acceden al mapa ni al ABM de usuarios); actas e instructivos para todos.
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  if (q.length < 2) return NextResponse.json({ resultados: [] });

  const esModAdmin = isModOrAdmin(session.rol);
  const contains = { contains: q, mode: "insensitive" as const };
  const resultados: Resultado[] = [];

  const tareas: Promise<void>[] = [];

  // ── Actas (todos) ──
  tareas.push((async () => {
    const actas = await prisma.acta.findMany({
      where: {
        OR: [
          { nombre: contains },
          { descripcion: contains },
          { archivoNombre: contains },
          { predio: { nombre: contains } },
        ],
      },
      select: { id: true, nombre: true, archivoNombre: true, predio: { select: { nombre: true } } },
      orderBy: { createdAt: "desc" },
      take: POR_TIPO,
    });
    for (const a of actas) {
      resultados.push({
        tipo: "acta",
        id: a.id,
        titulo: a.nombre || a.archivoNombre,
        subtitulo: a.predio?.nombre ? `Predio: ${a.predio.nombre}` : a.archivoNombre,
        href: `/dashboard/actas?search=${encodeURIComponent(a.nombre || a.archivoNombre)}`,
      });
    }
  })());

  // ── Instructivos (todos, solo activos) ──
  tareas.push((async () => {
    const insts = await prisma.instructivo.findMany({
      where: {
        activo: true,
        OR: [{ titulo: contains }, { descripcion: contains }, { contenido: contains }, { categoria: contains }],
      },
      select: { id: true, titulo: true, categoria: true },
      orderBy: { orden: "asc" },
      take: POR_TIPO,
    });
    for (const i of insts) {
      resultados.push({
        tipo: "instructivo",
        id: i.id,
        titulo: i.titulo,
        subtitulo: i.categoria,
        href: `/dashboard/instructivo?search=${encodeURIComponent(i.titulo)}`,
      });
    }
  })());

  // ── Predios (solo mod/admin: los técnicos no acceden al mapa) ──
  if (esModAdmin) {
    tareas.push((async () => {
      const predios = await prisma.predio.findMany({
        where: {
          OR: [
            { nombre: contains },
            { codigo: contains },
            { incidencias: contains },
            { cue: contains },
            { cuePredio: contains },
            { direccion: contains },
            { nombreInstitucion: contains },
            { provincia: contains },
          ],
        },
        select: { id: true, nombre: true, codigo: true, provincia: true, estado: { select: { nombre: true } } },
        orderBy: { updatedAt: "desc" },
        take: POR_TIPO,
      });
      for (const p of predios) {
        const partes = [p.codigo, p.provincia, p.estado?.nombre].filter(Boolean);
        resultados.push({
          tipo: "predio",
          id: p.id,
          titulo: p.nombre,
          subtitulo: partes.join(" · ") || undefined,
          href: `/dashboard/predios?search=${encodeURIComponent(p.codigo || p.nombre)}`,
        });
      }
    })());

    // ── Usuarios (solo mod/admin) ──
    tareas.push((async () => {
      const usuarios = await prisma.user.findMany({
        where: {
          activo: true,
          OR: [{ nombre: contains }, { email: contains }],
        },
        select: { id: true, nombre: true, email: true, rol: true },
        orderBy: { nombre: "asc" },
        take: POR_TIPO,
      });
      for (const u of usuarios) {
        resultados.push({
          tipo: "usuario",
          id: u.id,
          titulo: u.nombre,
          subtitulo: `${u.email} · ${u.rol}`,
          href: `/dashboard/usuarios`,
        });
      }
    })());
  }

  await Promise.all(tareas);

  return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
}
