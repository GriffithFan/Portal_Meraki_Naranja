import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { SALESFORCE_USUARIOS, esUsuarioSalesforceValido } from "@/lib/salesforceUsuarios";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Mapeo técnico (Carrot) ↔ usuario de Salesforce. Solo ADMIN.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  const tecnicos = await prisma.user.findMany({
    where: { activo: true, rol: { in: ["TECNICO", "MODERADOR", "ADMIN"] } },
    orderBy: { nombre: "asc" },
    select: { id: true, nombre: true, email: true, rol: true, salesforceUser: true },
  });
  return NextResponse.json({ catalogo: SALESFORCE_USUARIOS, tecnicos });
}

// PATCH { userId, salesforceUser }  — asigna (o limpia con "") el usuario SF de un técnico.
export async function PATCH(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  if (session.rol !== "ADMIN") return NextResponse.json({ error: "Solo administradores" }, { status: 403 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "JSON inválido" }, { status: 400 }); }
  const userId = String(body?.userId || "");
  if (!userId) return NextResponse.json({ error: "userId requerido" }, { status: 400 });
  const raw = typeof body?.salesforceUser === "string" ? body.salesforceUser.trim() : "";
  const salesforceUser = raw || null;
  if (salesforceUser && !esUsuarioSalesforceValido(salesforceUser)) {
    return NextResponse.json({ error: "Usuario de Salesforce no válido" }, { status: 400 });
  }

  // Un mismo usuario SF no debería estar en dos técnicos activos a la vez.
  if (salesforceUser) {
    const enUso = await prisma.user.findFirst({
      where: { salesforceUser, activo: true, id: { not: userId } },
      select: { nombre: true },
    });
    if (enUso) return NextResponse.json({ error: `"${salesforceUser}" ya está asignado a ${enUso.nombre}` }, { status: 409 });
  }

  const u = await prisma.user.update({
    where: { id: userId },
    data: { salesforceUser },
    select: { id: true, nombre: true, salesforceUser: true },
  });
  return NextResponse.json(u);
}
