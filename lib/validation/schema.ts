import { z } from "zod";
import { screeningInputSchema } from "../screening/schema";

/**
 * Contrato de entrada — payload simulado de postulación.
 *
 * La empresa ya tiene BUK, así que la API de LinkedIn no se toca: la
 * postulación se simula con este payload (restricción 2.8 de la ficha).
 * El conector la transforma y la empuja al apartado Postulados del BUK
 * existente.
 */

export const candidateSchema = z.object({
  first_name: z.string().min(1, "Nombre obligatorio"),
  surname: z.string().min(1, "Apellido obligatorio"),
  // .trim() antes de .email() — el correo es la clave de duplicados y los
  // espacios alrededor deberían ignorarse siempre.
  email: z.string().trim().email("Correo inválido"),
  phone: z
    .string()
    .regex(/^\+?[0-9\s\-()]{7,20}$/, "Teléfono inválido")
    .optional()
    .or(z.literal("")),
  linkedin_url: z
    .string()
    .url("URL de LinkedIn inválida")
    .optional()
    .or(z.literal("")),
  document_type: z.string().min(1, "Tipo de documento obligatorio"),
  document_number: z.string().min(1, "Número de documento obligatorio"),
  location: z.string().optional().or(z.literal("")),
  studies_level: z.string().optional().or(z.literal("")),
  academic_degree: z.string().optional().or(z.literal("")),
  experience_years: z.number().int().min(0).max(60).optional(),
  cv_url: z.string().url("URL del CV inválida").optional().or(z.literal("")),
  cv_path: z.string().max(300).optional(),
});

export const jobSchema = z.object({
  title: z.string().min(1, "Título de la vacante obligatorio"),
  reference: z.string().min(1, "Referencia de la vacante obligatoria"),
});

export const postulationSchema = z.object({
  /** Identificador único de la postulación — clave para la idempotencia */
  external_id: z.string().min(1, "external_id obligatorio"),
  /** Fecha de postulación YYYY-MM-DD */
  applied_at: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha inválida (YYYY-MM-DD)"),
  /** Origen — siempre "linkedin" en este prototipo */
  source: z.enum(["linkedin", "other"]).default("linkedin"),
  consentimiento_tratamiento_datos: z.boolean().optional(),
  job: jobSchema,
  candidate: candidateSchema,
  screening: screeningInputSchema.optional(),
});

export type PostulationInput = z.infer<typeof postulationSchema>;
export type CandidateInput = z.infer<typeof candidateSchema>;
