import { NextResponse } from "next/server";
import { getOrganizations } from "@/lib/meraki";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
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
