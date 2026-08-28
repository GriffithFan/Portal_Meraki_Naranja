import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession, isAdmin, isModOrAdmin, invalidateSessionCache } from "@/lib/auth";
import bcrypt from "bcryptjs";
import { thEfectivo, thEsHeredado, mapaTh } from "@/lib/thEfectivo";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Longitud mínima de contraseña (política de cuentas)
const MIN_PASSWORD_LEN = 10;

/**
 * GET /api/usuarios — Lista usuarios activos (Admin/Mod).
 * No se exponen contraseñas: el admin las restablece, no las consulta.
 */
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (!isModOrAdmin(session.rol)) return NextResponse.json({ error: "Sin permisos" }, { status: 403 });

  const usuarios = await prisma.user.findMany({
    where: { activo: true },
    select: {
      id: true, nombre: true, email: true, rol: true, esMesa: true, esCoordinador: true, coordinadorId: true, twoFactorEnabled: true, thNumero: true,
    },
    orderBy: { nombre: "asc" },
  });

  // Un tecnico a cargo de un coordinador trabaja bajo el TH de el (ver lib/thEfectivo).
  // Se calcula al vuelo: si se copiara al usuario, cambiar el TH del coordinador
  // dejaria a los suyos con el numero viejo.
  const th = mapaTh(usuarios);
  return NextResponse.json(usuarios.map((u) => ({
    ...u,
    thEfectivo: thEfectivo(u, th),
    thHeredado: thEsHeredado(u, th),
  })));
}

/**
 * Valida un coordinadorId propuesto para un técnico: debe ser un usuario ACTIVO
 * marcado como coordinador (`esCoordinador`) y no puede ser el propio usuario.
 * Devuelve un mensaje de error o null si es válido. `""`/null = limpiar (válido).
 */
async function validarCoordinador(coordinadorId: unknown, selfId?: string): Promise<string | null> {
  if (coordinadorId === undefined) return null;      // no se toca
  if (coordinadorId === null || coordinadorId === "") return null; // limpiar
  if (typeof coordinadorId !== "string") return "Coordinador inválido";
  if (selfId && coordinadorId === selfId) return "Un usuario no puede ser su propio coordinador";
  const coord = await prisma.user.findFirst({
    where: { id: coordinadorId, activo: true, esCoordinador: true },
    select: { id: true },
  });
  if (!coord) return "El coordinador elegido no existe o no está marcado como coordinador";
  return null;
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
    const { nombre, email, password, rol, esMesa, esCoordinador, coordinadorId } = body;

    if (!nombre?.trim() || !email?.trim() || !password?.trim()) {
      return NextResponse.json({ error: "Nombre, email y contraseña son obligatorios" }, { status: 400 });
    }

    const errCoord = await validarCoordinador(coordinadorId);
    if (errCoord) return NextResponse.json({ error: errCoord }, { status: 400 });

    if (password.trim().length < MIN_PASSWORD_LEN) {
      return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres` }, { status: 400 });
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
        rol: ["ADMIN", "MODERADOR", "TECNICO", "USUARIO"].includes(rol) ? rol : "TECNICO",
        esMesa: esMesa === true,
        esCoordinador: esCoordinador === true,
        coordinadorId: typeof coordinadorId === "string" && coordinadorId ? coordinadorId : null,
      },
      select: { id: true, nombre: true, email: true, rol: true, esMesa: true, esCoordinador: true, coordinadorId: true },
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
    const { userId, rol, password, esMesa, esCoordinador, coordinadorId, nombre, thNumero } = body;

    if (!userId) {
      return NextResponse.json({ error: "userId requerido" }, { status: 400 });
    }

    if (userId === session.userId && rol) {
      return NextResponse.json({ error: "No puedes cambiar tu propio rol" }, { status: 400 });
    }

    const errCoord = await validarCoordinador(coordinadorId, userId);
    if (errCoord) return NextResponse.json({ error: errCoord }, { status: 400 });

    const data: any = {};

    if (rol && ["ADMIN", "MODERADOR", "TECNICO", "USUARIO"].includes(rol)) {
      data.rol = rol;
    }

    if (typeof esMesa === "boolean") {
      data.esMesa = esMesa;
    }

    if (typeof esCoordinador === "boolean") {
      data.esCoordinador = esCoordinador;
    }

    // coordinadorId: null/"" limpia; string válido (ya validado) asigna.
    if (coordinadorId !== undefined) {
      data.coordinadorId = coordinadorId === null || coordinadorId === "" ? null : coordinadorId;
    }

    if (nombre?.trim()) {
      data.nombre = nombre.trim();
    }

    // Identificador TH (1-30): null/0/"" limpia; 1-30 asigna (único entre activos).
    if (thNumero !== undefined) {
      if (thNumero === null || thNumero === 0 || thNumero === "") {
        data.thNumero = null;
      } else {
        const n = Number(thNumero);
        if (!Number.isInteger(n) || n < 1 || n > 30) {
          return NextResponse.json({ error: "El identificador debe ser TH01 a TH30" }, { status: 400 });
        }
        const ocupado = await prisma.user.findFirst({
          where: { thNumero: n, activo: true, NOT: { id: userId } },
          select: { nombre: true },
        });
        if (ocupado) {
          return NextResponse.json({ error: `TH${String(n).padStart(2, "0")} ya está asignado a ${ocupado.nombre}` }, { status: 409 });
        }
        data.thNumero = n;
      }
    }

    if (password?.trim()) {
      if (password.trim().length < MIN_PASSWORD_LEN) {
        return NextResponse.json({ error: `La contraseña debe tener al menos ${MIN_PASSWORD_LEN} caracteres` }, { status: 400 });
      }
      data.password = await bcrypt.hash(password.trim(), 12);
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Nada que actualizar" }, { status: 400 });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, nombre: true, email: true, rol: true, esMesa: true, esCoordinador: true, coordinadorId: true, twoFactorEnabled: true, thNumero: true },
    });

    // Refrescar la sesión del usuario afectado (rol/activo/password al instante)
    invalidateSessionCache(userId);

    return NextResponse.json(updated);
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Ese identificador TH ya está asignado" }, { status: 409 });
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
      data: { activo: false, thNumero: null }, // liberar el identificador TH al desactivar
    });

    // Cortar la sesión del usuario desactivado de inmediato
    invalidateSessionCache(userId);

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
}
