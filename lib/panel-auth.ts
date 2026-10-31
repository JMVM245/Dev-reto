import { createHmac, timingSafeEqual } from "node:crypto";

export const PANEL_COOKIE = "devsync_recruiter_session";
const SESSION_SECONDS = 60 * 60 * 8;

function sessionSecret() {
  return process.env.PANEL_SESSION_SECRET?.trim() ?? "";
}

export function panelLoginConfigured() {
  return Boolean(process.env.PANEL_PASSWORD?.trim() && sessionSecret().length >= 32);
}

function signature(payload: string) {
  return createHmac("sha256", sessionSecret()).update(payload).digest("base64url");
}

export function createPanelSession() {
  const payload = `${Math.floor(Date.now() / 1000) + SESSION_SECONDS}.${crypto.randomUUID()}`;
  return `${payload}.${signature(payload)}`;
}

export function isPanelSessionValid(request: Request) {
  if (!panelLoginConfigured()) return false;
  const cookieHeader = request.headers.get("cookie") ?? "";
  const token = cookieHeader.split(";").map(part => part.trim()).find(part => part.startsWith(`${PANEL_COOKIE}=`))?.slice(PANEL_COOKIE.length + 1);
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 1) return false;
  const payload = token.slice(0, dot);
  const supplied = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(signature(payload));
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return false;
  const expiresAt = Number(payload.split(".", 1)[0]);
  return Number.isFinite(expiresAt) && expiresAt > Math.floor(Date.now() / 1000);
}

export function verifyPanelPassword(password: unknown) {
  const configured = Buffer.from(process.env.PANEL_PASSWORD ?? "");
  const supplied = Buffer.from(typeof password === "string" ? password : "");
  return configured.length > 0 && configured.length === supplied.length && timingSafeEqual(configured, supplied);
}

export function panelCookieHeader(value: string, maxAge = SESSION_SECONDS) {
  return `${PANEL_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
