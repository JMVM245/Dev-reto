import type { BukClient } from "./client";
import { BukClientMock } from "./mock";
import { BukClientReal } from "./real";

/**
 * Fábrica del conector.
 *
 * Se decide por variable de entorno, no por código. Cambiar de simulación
 * al BUK real es tocar `.env` — no reescribir la lógica. Eso es lo que
 * permite demostrar el flujo completo sin depender de que el entorno de
 * pruebas esté listo hoy.
 */
export function createBukClient(): BukClient {
  const mode = (process.env.BUK_MODE ?? "mock").trim().toLowerCase();
  return mode === "real" ? new BukClientReal() : new BukClientMock();
}

/** Solo el simulador expone la vista del apartado Postulados */
export function createMockClient(): BukClientMock {
  return new BukClientMock();
}
