import type { PostulationInput } from "../validation/schema";

/**
 * Escenarios de prueba para la consola técnica.
 *
 * La consola NO es una web para usuarios — es un banco de pruebas del
 * equipo. Estos escenarios reproducen los casos que hay que demostrar:
 * llegada normal, duplicado, otra vacante, payload inválido y fallo del BUK.
 *
 * Cada escenario construye su propio payload. Algunos dependen de un estado
 * previo (por ejemplo, "duplicado" necesita que el candidato ya exista), así
 * que la consola ofrece un escenario "sembrar" que deja el BUK simulado en
 * un estado conocido.
 */

export interface Escenario {
  clave: string;
  titulo: string;
  descripcion: string;
  /** Qué se espera que pase — se muestra en la consola antes de enviar */
  esperado: string;
  /** Payload simulado que se envía */
  construir: () => PostulationInput;
  /** Si está, el conector simulará un fallo del BUK con ese estado */
  forzarErrorBuk?: number;
}

const HOY = new Date().toISOString().slice(0, 10);

/**
 * external_id único.
 *
 * Date.now() solo NO basta: dos escenarios construidos en el mismo
 * milisegundo chocarían. Se combina con un contador y un sufijo aleatorio.
 */
let contadorExternos = 0;
function nuevoExternalId(): string {
  contadorExternos += 1;
  const sufijo = Math.random().toString(36).slice(2, 6);
  return `li-${Date.now()}-${contadorExternos}-${sufijo}`;
}

function base(
  externalId: string,
  job: { title: string; reference: string },
  candidate: PostulationInput["candidate"],
): PostulationInput {
  return {
    external_id: externalId,
    applied_at: HOY,
    source: "linkedin",
    job,
    candidate,
  };
}

const VACANTE_BACKEND = { title: "Desarrollador Backend", reference: "DEV-BE-2026" };
const VACANTE_DATOS = { title: "Analista de Datos", reference: "DA-2026" };

export const ESCENARIOS: Escenario[] = [
  {
    clave: "nueva",
    titulo: "Postulación nueva",
    descripcion:
      "Candidato que no existe en el BUK. Debe crear la ficha y ligarla a la vacante.",
    esperado: "Se crea el postulante y la postulación — aparece en Postulados.",
    construir: () =>
      base(nuevoExternalId(), VACANTE_BACKEND, {
        first_name: "María",
        surname: "García López",
        email: "maria.garcia@example.com",
        phone: "3001234567",
        linkedin_url: "https://www.linkedin.com/in/maria-garcia-example",
        document_type: "cc",
        document_number: "1035987654",
        location: "Medellín",
        studies_level: "Educación superior completa",
        academic_degree: "Ingeniera de Sistemas",
        experience_years: 5,
        cv_url: "https://ejemplo.com/cv/maria-garcia.pdf",
      }),
  },
  {
    clave: "duplicado",
    titulo: "Misma persona, misma vacante",
    descripcion:
      "Carlos Mendoza ya está postulado a DEV-BE-2026 (viene sembrado). Debe detectarse como duplicado y NO crear otro registro.",
    esperado: "Se bloquea el duplicado. No se crea registro nuevo en Postulados.",
    construir: () =>
      base(nuevoExternalId(), VACANTE_BACKEND, {
        first_name: "Carlos",
        surname: "Mendoza Ruiz",
        email: "CARLOS.MENDOZA@example.com",
        document_type: "cc",
        document_number: "80123456",
      }),
  },
  {
    clave: "otra_vacante",
    titulo: "Misma persona, otra vacante",
    descripcion:
      "Carlos Mendoza se postula a DA-2026. Ya existe su ficha pero no en esa vacante — NO es duplicado: se reutiliza la ficha y se crea la postulación.",
    esperado: "Se reutiliza el postulante y aparece en la otra vacante.",
    construir: () =>
      base(nuevoExternalId(), VACANTE_DATOS, {
        first_name: "Carlos",
        surname: "Mendoza Ruiz",
        email: "carlos.mendoza@example.com",
        document_type: "cc",
        document_number: "80123456",
      }),
  },
  {
    clave: "invalido",
    titulo: "Payload inválido",
    descripcion:
      "Faltan campos obligatorios y la fecha tiene un formato mal. El conector debe rechazar ANTES de tocar el BUK.",
    esperado: "Se rechaza en la validación — el BUK simulado no se toca.",
    construir: () => ({
      external_id: nuevoExternalId(),
      applied_at: "16/10/2026",
      source: "linkedin",
      job: { title: "QA", reference: "QA-2026" },
      candidate: {
        first_name: "",
        surname: "Pérez",
        email: "no-es-correo",
        document_type: "cc",
        document_number: "1",
      },
    }),
  },
  {
    clave: "fallo_buk",
    titulo: "El BUK falla (500)",
    descripcion:
      "El BUK existente responde con un error de servidor. El conector debe marcarlo como reintentable y dejarlo en la traza.",
    esperado: "Error 500 — marcado como reintentable, no como fallo definitivo.",
    forzarErrorBuk: 500,
    construir: () =>
      base(nuevoExternalId(), VACANTE_BACKEND, {
        first_name: "Ana",
        surname: "Torres",
        email: `ana.torres.${Math.floor(Math.random() * 99999)}@example.com`,
        document_type: "cc",
        document_number: "1009876543",
      }),
  },
];

export function buscarEscenario(clave: string): Escenario | undefined {
  return ESCENARIOS.find((e) => e.clave === clave);
}
