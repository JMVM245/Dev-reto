import { NextResponse } from "next/server";
import { isPanelSessionValid, panelLoginConfigured } from "@/lib/panel-auth";

export async function GET(request: Request) {
  const configured = panelLoginConfigured();
  return NextResponse.json({ ok: configured && isPanelSessionValid(request), configured }, { status: configured ? 200 : 503 });
}
