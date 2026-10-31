import type {
  BukApplicant,
  BukApplicantInput,
  BukApplication,
  BukApplicationInput,
} from "./types";

/**
 * Contrato del conector hacia el BUK existente.
 *
 * Dos implementaciones:
 *   - BukClientReal  -> empuja al BUK real de la empresa vía su API REST
 *   - BukClientMock  -> simula ese BUK, sin credenciales
 *
 * El resto del código no sabe con cuál está hablando. Cambiar de mock a
 * real es tocar `.env` — no reescribir la lógica. Por eso el prototipo
 * demuestra el flujo completo aunque la empresa aún no haya entregado el
 * entorno de pruebas.
 */
export interface BukClient {
  /** Nombre del conector, para dejarlo claro en trazas y en la consola */
  readonly mode: "real" | "mock";

  /** POST /recruiting/applicants — crea la ficha del candidato */
  createApplicant(input: BukApplicantInput): Promise<BukApplicant>;

  /** POST /recruiting/applicants/search_by_email — busca por correo */
  findApplicantByEmail(email: string): Promise<BukApplicant | null>;

  /** POST /recruiting/applications — liga el candidato a la vacante */
  createApplication(input: BukApplicationInput): Promise<BukApplication>;

  /** GET /recruiting/applications — verifica si ya existe la postulación */
  findApplication(
    applicantId: string,
    selectionProcessId: number,
  ): Promise<BukApplication | null>;
}

/** Error tipado del conector — distingue lo reintentable de lo que no */
export class BukApiError extends Error {
  /** Estado HTTP devuelto por BUK (0 = fallo de red) */
  readonly status: number;
  /** true => fallo de red o 5xx, se puede reintentar */
  readonly retryable: boolean;

  constructor(message: string, status: number, retryable: boolean) {
    super(message);
    this.name = "BukApiError";
    this.status = status;
    this.retryable = retryable;
  }
}
