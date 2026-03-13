import { NextResponse } from "next/server";
import { getOrganizations } from "@/lib/meraki";
import { getSession, isModOrAdmin } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session || !isModOrAdmin(session.rol))
    return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
  try {
    const orgId = process.env.MERAKI_ORG_ID;
    if (orgId) {
      return NextResponse.json([{ id: orgId, name: "Default" }]);
    }
    const orgs = await getOrganizations();
    return NextResponse.json(orgs);
  } catch (error) {
    console.error("[meraki/organizations]", error);
    return NextResponse.json({ error: "Error listando organizaciones" }, { status: 500 });
  }
}
