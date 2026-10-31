import { NextResponse } from "next/server";
import { createPanelSession, panelCookieHeader, panelLoginConfigured, verifyPanelPassword } from "@/lib/panel-auth";

export async function POST(request: Request) {
  if (!panelLoginConfigured()) {
    return NextResponse.json({ ok: false, error: "Configura PANEL_PASSWORD y PANEL_SESSION_SECRET para habilitar el panel privado." }, { status: 503 });
  }
  let body: { password?: unknown };
  try { body = await request.json() as { password?: unknown }; }
  catch { return NextResponse.json({ ok: false, error: "Solicitud inválida." }, { status: 400 }); }
  if (!verifyPanelPassword(body.password)) {
    return NextResponse.json({ ok: false, error: "La contraseña no es correcta." }, { status: 401 });
  }
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", panelCookieHeader(createPanelSession()));
  return response;
}
