import type { BukClient } from "./client";
// Extensión explícita: la requiere el ejecutor de pruebas de Node (ESM).
// Next.js/webpack la resuelve igual.
import { BukApiError } from "./client.ts";
import type {
  BukApplicant,
  BukApplicantInput,
  BukApplication,
  BukApplicationInput,
} from "./types";

/**
 * Simulación del BUK EXISTENTE de la empresa.
 *
 * DevSync usa BUK en este demo — el conector conserva la integración simulada y solo
 * empuja la postulación al apartado Postulados de su cuenta. Como no hay
 * credenciales todavía, este módulo reproduce el comportamiento documentado
 * de esa API para poder demostrar el flujo completo.
 *
 * Comportamiento imitado:
 *  - 400 con { errors: [...] } si faltan campos obligatorios
 *  - 404 con { errors: [...] } si el recurso no existe
 *  - IDs incrementales
 *  - search_by_email devuelve null cuando no hay coincidencia
 *
 * Además expone `listarPostulados`, que es la vista que importa: lo que
 * aparecería en el apartado Postulados de la vacante dentro de su BUK.
 */

/** Una fila del apartado Postulados dentro del BUK simulado */
export interface PostuladoVista {
  applicant_id: string;
  application_id: string;
  nombre: string;
  correo: string;
  vacante_id: number;
  vacante_titulo: string;
  vacante_referencia: string;
  etapa: string;
  fecha_postulacion: string;
  origen: string;
  linkedin_url?: string;
  cv_url?: string;
}

interface Guardado {
  id: number | string;
  first_name: string;
  surname: string;
  email?: string;
  linkedin_url?: string;
  cv_url?: string;
}

interface AplicacionGuardada {
  id: number | string;
  applicant_id: string;
  selection_process_id: number;
  vacante_titulo: string;
  vacante_referencia: string;
  etapa: string;
  application_date: string;
  referrer?: string;
}

interface EstadoSimulado {
  nextApplicantId: number;
  nextApplicationId: number;
  applicants: Map<string, Guardado>;
  applications: AplicacionGuardada[];
}

declare global {
  // eslint-disable-next-line no-var
  var __bukSimulado: EstadoSimulado | undefined;
  // eslint-disable-next-line no-var
  var __bukSimuladoVersion: string | undefined;
}

/** El BUK de demostración inicia vacío. */
function sembrar(): EstadoSimulado {
  const applicants = new Map<string, Guardado>();
  return {
    nextApplicantId: 1001,
    nextApplicationId: 5001,
    applicants,
    applications: [],
  };
}

function getEstado(): EstadoSimulado {
  if (globalThis.__bukSimuladoVersion !== "empty-postulants-v2") {
    globalThis.__bukSimulado = undefined;
    globalThis.__bukSimuladoVersion = "empty-postulants-v2";
  }
  if (!globalThis.__bukSimulado) {
    globalThis.__bukSimulado = sembrar();
  }
  return globalThis.__bukSimulado;
}

/** Reinicia el BUK simulado a su estado inicial — útil entre pruebas */
export function resetSimulacion(): void {
  globalThis.__bukSimulado = undefined;
  globalThis.__bukSimuladoVersion = "empty-postulants-v2";
}

export class BukClientMock implements BukClient {
  readonly mode = "mock" as const;

  /** Un solo fallo forzado, para simular un 500 de BUK en las pruebas.
   *  Se consume solo al ESCRIBIR (createApplicant/createApplication), que
   *  es donde un fallo real haría fallar la postulación. */
  private static proximoError: number | null = null;

  static forzarError(status: number): void {
    BukClientMock.proximoError = status;
  }

  private consumirError(): void {
    if (BukClientMock.proximoError !== null) {
      const status = BukClientMock.proximoError;
      BukClientMock.proximoError = null;
      throw new BukApiError(
        `${status} — Falla simulada del BUK (para probar el reintento)`,
        status,
        status >= 500,
      );
    }
  }

  async createApplicant(input: BukApplicantInput): Promise<BukApplicant> {
    this.consumirError();
    const estado = getEstado();

    const missing: string[] = [];
    if (!input.first_name) missing.push("first_name");
    if (!input.surname) missing.push("surname");

    if (missing.length > 0) {
      throw new BukApiError(
        `400 — Faltan campos obligatorios: ${missing.join(", ")}`,
        400,
        false,
      );
    }

    const id = estado.nextApplicantId++;
    const guardado: Guardado = {
      id,
      first_name: input.first_name,
      surname: input.surname,
      email: input.email,
      linkedin_url: input.linkedin_url,
      cv_url: input.cv_url?.cv_url,
    };
    estado.applicants.set(String(id), guardado);
    return { id, first_name: input.first_name, surname: input.surname, email: input.email };
  }

  async findApplicantByEmail(email: string): Promise<BukApplicant | null> {
    const normalized = email.trim().toLowerCase();
    for (const a of getEstado().applicants.values()) {
      if (a.email && a.email.trim().toLowerCase() === normalized) {
        return { id: a.id, first_name: a.first_name, surname: a.surname, email: a.email };
      }
    }
    return null;
  }

  async createApplication(input: BukApplicationInput): Promise<BukApplication> {
    this.consumirError();
    const estado = getEstado();

    if (!input.selection_process_id) {
      throw new BukApiError("400 — selection_process_id es obligatorio", 400, false);
    }

    const postulante = estado.applicants.get(String(input.applicant_id));
    if (!postulante) {
      throw new BukApiError(
        `404 — No existe el postulante con id ${input.applicant_id}`,
        404,
        false,
      );
    }

    const id = estado.nextApplicationId++;
    const etapa = input.process_stage_id ?? "Postulantes";

    // Los datos de la vacante vienen del mapper vía custom_attributes.
    const attrs = input.custom_attributes ?? {};

    const aplicacion: AplicacionGuardada = {
      id,
      applicant_id: String(input.applicant_id),
      selection_process_id: input.selection_process_id,
      vacante_titulo: attrs.vacancy_title ?? "(vacante)",
      vacante_referencia: attrs.vacancy_reference ?? "(sin referencia)",
      etapa,
      application_date: input.application_date ?? new Date().toISOString().slice(0, 10),
      referrer: input.referrer,
    };
    estado.applications.push(aplicacion);

    return {
      id,
      selection_process_id: input.selection_process_id,
      process_stage: { id: 1, name: etapa },
      application_date: aplicacion.application_date,
      applicant: { id: input.applicant_id },
    };
  }

  async findApplication(
    applicantId: string,
    selectionProcessId: number,
  ): Promise<BukApplication | null> {
    const match = getEstado().applications.find(
      (a) =>
        String(a.applicant_id) === String(applicantId) &&
        a.selection_process_id === selectionProcessId,
    );
    if (!match) return null;
    return {
      id: match.id,
      selection_process_id: match.selection_process_id,
      process_stage: { id: 1, name: match.etapa },
      application_date: match.application_date,
      applicant: { id: match.applicant_id },
    };
  }

  /**
   * Lo que se vería en el apartado Postulados del BUK existente.
   * Si se pasa una vacante, filtra a esa; si no, devuelve todas.
   */
  listarPostulados(vacanteId?: number): PostuladoVista[] {
    const estado = getEstado();
    return estado.applications
      .filter((a) => vacanteId === undefined || a.selection_process_id === vacanteId)
      .map((a) => {
        const p = estado.applicants.get(String(a.applicant_id));
        return {
          applicant_id: String(a.applicant_id),
          application_id: String(a.id),
          nombre: p ? `${p.first_name} ${p.surname}` : "(postulante no encontrado)",
          correo: p?.email ?? "—",
          vacante_id: a.selection_process_id,
          vacante_titulo: a.vacante_titulo,
          vacante_referencia: a.vacante_referencia,
          etapa: a.etapa,
          fecha_postulacion: a.application_date,
          origen: a.referrer ?? "—",
          linkedin_url: p?.linkedin_url,
          cv_url: p?.cv_url,
        };
      })
      .reverse(); // más reciente arriba
  }
}
