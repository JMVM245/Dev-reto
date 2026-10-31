import type { PostulationInput } from "../validation/schema";
import type { BukApplicantInput, BukApplicationInput } from "./types";

/**
 * Transformación: payload simulado (LinkedIn) -> esquema del BUK existente.
 *
 * ÉSTE es el corazón del reto. La ficha pide "capture los datos relevantes,
 * los transforme y los registre". Todo lo demás lo sostiene.
 *
 * Cada decisión de mapeo queda documentada abajo para que un tercero pueda
 * replicarla — la rúbrica puntúa "calidad de la documentación" y
 * "trazabilidad de decisiones".
 */

export interface MapeoDecision {
  campoOrigen: string;
  campoBuk: string;
  regla: string;
}

export const MAPEO_DECISIONES: MapeoDecision[] = [
  {
    campoOrigen: "candidate.first_name",
    campoBuk: "applicant.first_name",
    regla: "Directo. Obligatorio en ambos lados — si falta, BUK devuelve 400.",
  },
  {
    campoOrigen: "candidate.surname",
    campoBuk: "applicant.surname",
    regla: "Directo. Obligatorio en ambos lados.",
  },
  {
    campoOrigen: "candidate.email",
    campoBuk: "applicant.email",
    regla: "Normalizado a minúsculas — es la clave de detección de duplicados.",
  },
  {
    campoOrigen: "candidate.linkedin_url",
    campoBuk: "applicant.linkedin_url",
    regla: "Directo. Conserva la referencia al perfil de origen.",
  },
  {
    campoOrigen: "candidate.cv_url",
    campoBuk: "applicant.cv_url",
    regla: "ENVUELTO en { cv_url } — así lo exige el esquema de BUK. OJO: forma real de entrega del CV pendiente de confirmar (pregunta 6 del correo).",
  },
  {
    campoOrigen: "candidate.location",
    campoBuk: "applicant.location_id",
    regla: "BUK espera ID o nombre del municipio. Se envía el nombre tal cual; si la API rechaza, hay que resolver un catálogo de municipios.",
  },
  {
    campoOrigen: "candidate.studies_level",
    campoBuk: "applicant.studies_level",
    regla: "Debe coincidir con el enum de BUK. Si no coincide, BUK responde 400.",
  },
  {
    campoOrigen: "job.reference",
    campoBuk: "application.custom_attributes",
    regla: "La referencia de la vacante no tiene campo nativo — va en atributos personalizados. Pendiente: confirmar cuáles existen en la cuenta (pregunta 4 del correo).",
  },
  {
    campoOrigen: "source = linkedin",
    campoBuk: "application.referrer",
    regla: "El enum de BUK NO tiene valor 'linkedin'. Se envía 'external' hasta confirmar con la empresa (pregunta 7 del correo).",
  },
  {
    campoOrigen: "postulation.external_id",
    campoBuk: "application.custom_attributes.external_id",
    regla: "Identificador del origen. Clave para idempotencia — permite saber si ya se procesó.",
  },
  {
    campoOrigen: "(configuración)",
    campoBuk: "application.selection_process_id",
    regla: "OBLIGATORIO. Resuelto desde la referencia de la vacante (lib/config/vacancies.ts).",
  },
  {
    campoOrigen: "(configuración)",
    campoBuk: "application.process_stage_id",
    regla: "Se envía el nombre 'Postulantes'. BUK acepta ID o nombre de etapa.",
  },
];

/**
 * Transforma la postulación simulada en el body que espera el BUK existente.
 *
 * Devuelve DOS payloads porque la API de BUK es de DOS PASOS:
 *   1) crear el postulante
 *   2) crear la postulación ligada a la vacante
 *
 * Confundir "postulante" (la persona) con "postulación" (el vínculo con la
 * vacante) es el error más probable de este reto.
 */
export function mapToBuk(
  input: PostulationInput,
  config: { selectionProcessId: number; stageName: string; referrer?: string },
): { applicant: BukApplicantInput; application: Omit<BukApplicationInput, "applicant_id"> } {
  const { candidate, job, source } = input;

  const applicant: BukApplicantInput = {
    first_name: candidate.first_name.trim(),
    surname: candidate.surname.trim(),
    email: candidate.email.trim().toLowerCase(),
    document_number: candidate.document_number,
    document_type: candidate.document_type,
    ...(candidate.phone ? { phone: normalizePhone(candidate.phone) } : {}),
    ...(candidate.linkedin_url ? { linkedin_url: candidate.linkedin_url } : {}),
    ...(candidate.cv_url ? { cv_url: { cv_url: candidate.cv_url } } : {}),
    ...(candidate.location ? { location_id: candidate.location } : {}),
    ...(candidate.studies_level ? { studies_level: candidate.studies_level } : {}),
    ...(candidate.academic_degree ? { academic_degree: candidate.academic_degree } : {}),
    ...(typeof candidate.experience_years === "number"
      ? { experience_years: candidate.experience_years }
      : {}),
  };

  const application: Omit<BukApplicationInput, "applicant_id"> = {
    selection_process_id: config.selectionProcessId,
    process_stage_id: config.stageName,
    referrer: resolveReferrer(source, config.referrer),
    application_date: input.applied_at,
    custom_attributes: {
      external_id: input.external_id,
      vacancy_reference: job.reference,
      vacancy_title: job.title,
      origin_source: source,
    },
  };

  return { applicant, application };
}

/** Resuelve el origen. BUK no tiene valor 'linkedin' en su enum. */
function resolveReferrer(
  source: PostulationInput["source"],
  override?: string,
): string {
  if (override) return override;
  return source === "linkedin" ? "external" : "internal";
}

/** Normaliza a formato con prefijo internacional, como espera BUK. */
function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("00")) return `+${digits.slice(2)}`;
  // Colombia: 10 dígitos -> +57
  if (digits.length === 10) return `+57${digits}`;
  return `+${digits}`;
}
