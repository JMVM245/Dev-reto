/**
 * Traza del conector.
 *
 * Registra cada paso del procesamiento de una postulación. Sirve para dos
 * cosas:
 *
 *   1. Que la consola de pruebas muestre qué hizo el conector, paso a paso.
 *   2. Que el equipo pueda explicar el flujo en la presentación sin tener
 *      que leer código — la rúbrica puntúa "comunicación" (15 %) y
 *      "documentación" (10 %).
 */

export type EstadoPaso = "ok" | "error" | "omitido" | "duplicado" | "aviso";

export interface PasoTraza {
  /** Identificador corto del paso */
  paso: string;
  /** Nombre visible */
  titulo: string;
  estado: EstadoPaso;
  /** Qué pasó en este paso, en lenguaje claro */
  detalle: string;
  /** Duración de ESTE paso en ms */
  ms: number;
}

export class Traza {
  private marca = performance.now();
  pasos: PasoTraza[] = [];

  /**
   * Registra un paso y arranca la marca para el siguiente.
   * `fn` es opcional: si se pasa, se ejecuta y su resultado se registra
   * automáticamente (ok si devuelve, error si lanza).
   */
  async paso<T>(
    clave: string,
    titulo: string,
    fn: () => Promise<T>,
  ): Promise<{ ok: true; valor: T } | { ok: false; error: Error }> {
    try {
      const valor = await fn();
      this.registrar(clave, titulo, "ok", describe(valor));
      return { ok: true, valor };
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      this.registrar(clave, titulo, "error", error.message);
      return { ok: false, error };
    }
  }

  registrar(paso: string, titulo: string, estado: EstadoPaso, detalle: string): void {
    const ahora = performance.now();
    this.pasos.push({
      paso,
      titulo,
      estado,
      detalle,
      ms: Math.round(ahora - this.marca),
    });
    this.marca = ahora;
  }

  get totalMs(): number {
    return this.pasos.reduce((acc, p) => acc + p.ms, 0);
  }
}

function describe(valor: unknown): string {
  if (valor === null || valor === undefined) return "Sin valor";
  if (typeof valor === "object") return JSON.stringify(valor);
  return String(valor);
}
