import { NextResponse } from "next/server";
import { panelCookieHeader } from "@/lib/panel-auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.headers.set("Set-Cookie", panelCookieHeader("", 0));
  return response;
}
