import type { BukClient } from "./client";
import { BukApiError } from "./client";
import type {
  BukApplicant,
  BukApplicantInput,
  BukApplication,
  BukApplicationInput,
} from "./types";

/**
 * Conector REAL hacia el BUK existente de la empresa.
 *
 * Documentación: https://{tenant}.buk.cl/apidocs
 * Autenticación: header `auth_token` con la API Key de
 * Configuración -> Accesos API (permisos de Selección en
 * "Lectura y Modificación").
 *
 * ⚠️ Esta clase NO se activa hasta que la empresa confirme el Grupo A
 * del correo de consultas. Mientras tanto corre el simulador.
 */

interface Config {
  baseUrl: string;
  authToken: string;
}

function getConfig(): Config {
  const baseUrl = process.env.BUK_BASE_URL?.trim();
  const authToken = process.env.BUK_AUTH_TOKEN?.trim();

  if (!baseUrl || !authToken) {
    throw new BukApiError(
      "500 — Faltan BUK_BASE_URL o BUK_AUTH_TOKEN. Revisa el archivo .env",
      500,
      false,
    );
  }

  return { baseUrl: baseUrl.replace(/\/$/, ""), authToken };
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown,
): Promise<T> {
  const { baseUrl, authToken } = getConfig();

  let res: Response;
  try {
    res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        auth_token: authToken,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch (err) {
    // Fallo de red -> sí es reintentable
    throw new BukApiError(
      `Sin respuesta del BUK: ${err instanceof Error ? err.message : String(err)}`,
      0,
      true,
    );
  }

  const text = await res.text();
  const payload = text ? safeParse(text) : null;

  if (!res.ok) {
    const message =
      payload && typeof payload === "object" && "errors" in payload
        ? formatErrors((payload as { errors: unknown }).errors)
        : `HTTP ${res.status} ${res.statusText}`;

    // 5xx => reintentable. 4xx => no, repetir el mismo body da lo mismo.
    throw new BukApiError(`${res.status} — ${message}`, res.status, res.status >= 500);
  }

  return payload as T;
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function formatErrors(errors: unknown): string {
  if (Array.isArray(errors)) return errors.join(", ");
  if (typeof errors === "string") return errors;
  return JSON.stringify(errors);
}

export class BukClientReal implements BukClient {
  readonly mode = "real" as const;

  async createApplicant(input: BukApplicantInput): Promise<BukApplicant> {
    const res = await request<{ applicant: BukApplicant }>(
      "POST",
      "/recruiting/applicants",
      { applicant: input },
    );
    return res.applicant;
  }

  async findApplicantByEmail(email: string): Promise<BukApplicant | null> {
    try {
      const res = await request<{ applicant: BukApplicant }>(
        "POST",
        "/recruiting/applicants/search_by_email",
        { applicant: { email } },
      );
      return res.applicant ?? null;
    } catch (err) {
      // 404 = no encontrado, no es un error para nosotros
      if (err instanceof BukApiError && err.status === 404) return null;
      throw err;
    }
  }

  async createApplication(input: BukApplicationInput): Promise<BukApplication> {
    const res = await request<{ application: BukApplication }>(
      "POST",
      "/recruiting/applications",
      { application: input },
    );
    return res.application;
  }

  async findApplication(
    applicantId: string,
    selectionProcessId: number,
  ): Promise<BukApplication | null> {
    const res = await request<{
      data?: BukApplication[];
      applications?: BukApplication[];
    }>(
      "GET",
      `/recruiting/applications?selection_processes[]=${selectionProcessId}&page_size=100`,
    );

    const list = res.data ?? res.applications ?? [];
    return (
      list.find(
        (a) => String(a.applicant?.id) === String(applicantId),
      ) ?? null
    );
  }
}
