import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin } from "@/lib/auth";
import bcrypt from "bcryptjs";

/* eslint-disable @typescript-eslint/no-explicit-any */

/**
 * GET /api/usuarios — Lista usuarios activos
 * Admin: incluye passwordPlain para poder verlas
 * Mod: solo id, nombre, email, rol, esMesa
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const esAdmin = isAdmin(session.rol);

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: {
      id: true, nombre: true, email: true, rol: true, esMesa: true,
      ...(esAdmin ? { passwordPlain: true } : {}),
    },
    orderBy: { nombre: "asc" },
  });

  return NextResponse.json(usuarios);
}

/**
 * POST /api/usuarios — Crear usuario (solo Admin)
 * Body: { nombre, email, password, rol?, esMesa? }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  try {
    const body = await req.json();
    const { nombre, email, password, rol, esMesa } = body;

    if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Nombre, email y contraseña son obligatorios" }, { status: 400 });
    }

    if (password.trim().length < 6) {
      return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
    }

    // Verificar email único
    const existe = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    if (existe) {
      return NextResponse.json({ error: "Ya existe un usuario con ese email" }, { status: 409 });
    }

    const hash = await bcrypt.hash(password.trim(), 12);

    const usuario = await prisma.user.create({
      data: {
        nombre: nombre.trim(),
        email: email.trim().toLowerCase(),
        password: hash,
        passwordPlain: password.trim(),
        rol: ["ADMIN", "MODERADOR", "TECNICO"].includes(rol) ? rol : "TECNICO",
        esMesa: esMesa === true,
      },
      select: { id: true, nombre: true, email: true, rol: true, esMesa: true, passwordPlain: true },
    });

    return NextResponse.json(usuario, { status: 201 });
  } catch (e: any) {
    console.error("[Usuarios] Error creando usuario:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * PATCH /api/usuarios — Editar usuario (solo Admin)
 * Body: { userId, rol?, password?, esMesa?, nombre? }
 */
export async function PATCH(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  try {
    const body = await req.json();
    const { userId, rol, password, esMesa, nombre } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    if (userId === session.userId && rol) {
      return NextResponse.json({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
    }

    const data: any = {};

    if (rol && ["ADMIN", "MODERADOR", "TECNICO"].includes(rol)) {
      data.rol = rol;
    }

    if (typeof esMesa === "boolean") {
      data.esMesa = esMesa;
    }

    if (nombre?.trim()) {
      data.nombre = nombre.trim();
    }

    if (password?.trim()) {
      if (password.trim().length < 6) {
        return NextResponse.json({ error: "La contraseña debe tener al menos 6 caracteres" }, { status: 400 });
      }
      data.password = await bcrypt.hash(password.trim(), 12);
      data.passwordPlain = password.trim();
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, nombre: true, email: true, rol: true, esMesa: true, passwordPlain: true },
    });

    return NextResponse.json(updated);
  } catch (e: any) {
    console.error("[Usuarios] Error actualizando usuario:", e);
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}

/**
 * DELETE /api/usuarios — Desactivar usuario (solo Admin)
 * Body: { userId }
 */
export async function DELETE(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isAdmin(session.rol)) return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    if (userId === session.userId) {
      return NextResponse.json({ error: "No puedes desactivar tu propio usuario" }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: userId },
      data: { activo: false },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
