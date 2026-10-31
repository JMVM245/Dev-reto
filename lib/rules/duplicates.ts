import type { PostulationInput } from "../validation/schema";
import type { BukClient } from "../buk/client";

/**
 * Detección de duplicados e idempotencia.
 *
 * Regla central del diseño. Buk YA expone la operación que necesitamos
 * (search_by_email), así que no construimos un motor propio: consultamos
 * antes de crear. Eso es una decisión de diseño que conviene documentar.
 */

export type Decision =
  | { tipo: "crear"; motivo: string }
  | { tipo: "reutilizar"; applicantId: string; motivo: string }
  | { tipo: "duplicado"; applicantId: string; motivo: string };

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Evalúa qué hacer con una postulación entrante.
 *
 * Distingue dos cosas que NO son lo mismo:
 *
 *   1. La MISMA persona que se postula dos veces a la MISMA vacante
 *      -> es un duplicado real, no se crea de nuevo.
 *
 *   2. Una persona que se postula a DOS vacantes distintas
 *      -> NO es duplicado. Es una ficha con dos postulaciones.
 */
export async function evaluarPostulacion(
  client: BukClient,
  input: PostulationInput,
  selectionProcessId: number,
): Promise<Decision> {
  const email = normalizeEmail(input.candidate.email);

  const existente = await client.findApplicantByEmail(email);

  if (!existente) {
    return {
      tipo: "crear",
      motivo: `No existe postulante con el correo ${email}.`,
    };
  }

  const applicantId = String(existente.id);

  // Existe la persona. ¿Ya se postuló a ESTA vacante?
  const aplicacionExistente = await client.findApplication(
    applicantId,
    selectionProcessId,
  );

  if (aplicacionExistente) {
    return {
      tipo: "duplicado",
      applicantId,
      motivo: `El postulante ${applicantId} ya tiene la postulación ${String(
        aplicacionExistente.id,
      )} a la vacante ${selectionProcessId}. No se duplica.`,
    };
  }

  return {
    tipo: "reutilizar",
    applicantId,
    motivo: `El postulante ${applicantId} ya existe pero no está en esta vacante. Se reutiliza la ficha y se crea una postulación nueva (postulación a vacante distinta NO es duplicado).`,
  };
}
