/**
 * Resolución de la vacante de destino.
 *
 * El conector empuja la postulación al apartado Postulados de la vacante
 * CORRESPONDIENTE dentro del BUK existente. La API de BUK identifica la
 * vacante por un `selection_process_id` numérico interno, que no aparece en
 * el payload simulado. Hace falta un puente entre la referencia del puesto
 * y ese ID.
 *
 * Se resuelve en dos niveles:
 *
 *   1. BUK_VACANCY_MAP — mapeo explícito por referencia de vacante.
 *        Ejemplo: {"DEV-BE-2026": 123, "DA-2026": 456}
 *
 *   2. BUK_SELECTION_PROCESS_ID — valor por defecto si la referencia
 *        no está en el mapa.
 *
 * PENDIENTE con la empresa: obtener la lista real de procesos de selección
 * y sus IDs. Con la API se puede hacer con
 * `GET /recruiting/selection_processes` y reemplazar este mapa por una
 * consulta real.
 */

export type ResolucionVacante =
  | { ok: true; selectionProcessId: number; origen: "mapa" | "por_defecto" | "mock" }
  | { ok: false; error: string };

const mockProcessIds: Record<string, number> = {
  "DEV-BE-2026": 123,
  "DEV-FS-2026": 124,
  "DA-2026": 456,
  "UX-2026": 789,
};

export function resolverVacante(referenciaVacante: string): ResolucionVacante {
  const mapa = parsearMapa(process.env.BUK_VACANCY_MAP);
  const porDefecto = process.env.BUK_SELECTION_PROCESS_ID?.trim();

  if (mapa) {
    const clave = Object.keys(mapa).find(
      (k) => k.toLowerCase() === referenciaVacante.trim().toLowerCase(),
    );
    if (clave) {
      return { ok: true, selectionProcessId: mapa[clave], origen: "mapa" };
    }
  }

  // In real mode, never route an unmapped job to an arbitrary default process.
  // Every active vacancy must be explicitly mapped to the matching Buk ID.
  if (process.env.BUK_MODE?.trim().toLowerCase() === "real") {
    return {
      ok: false,
      error: `La referencia "${referenciaVacante}" no está en BUK_VACANCY_MAP. Agrega el ID del proceso de selección de Buk antes de enviar candidatos.`,
    };
  }

  if (process.env.BUK_MODE?.trim().toLowerCase() !== "real") {
    const mockId = mockProcessIds[referenciaVacante.trim().toUpperCase()];
    if (mockId !== undefined) return { ok: true, selectionProcessId: mockId, origen: "mock" };
  }

  if (porDefecto) {
    const id = Number(porDefecto);
    if (!Number.isNaN(id)) {
      return { ok: true, selectionProcessId: id, origen: "por_defecto" };
    }
  }

  return {
    ok: false,
    error: mapa
      ? `No hay vacante mapeada para la referencia "${referenciaVacante}" y falta BUK_SELECTION_PROCESS_ID como valor por defecto.`
      : `Falta BUK_VACANCY_MAP o BUK_SELECTION_PROCESS_ID en .env. Sin ellos no se sabe en qué vacante registrar al candidato.`,
  };
}

function parsearMapa(raw: string | undefined): Record<string, number> | null {
  if (!raw || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    const salida: Record<string, number> = {};
    for (const [clave, valor] of Object.entries(parsed as Record<string, unknown>)) {
      const id = Number(valor);
      if (!Number.isNaN(id)) salida[clave] = id;
    }
    return Object.keys(salida).length > 0 ? salida : null;
  } catch {
    // JSON malformado no debe tumbar la petición — se ignora y se usa el
    // valor por defecto.
    return null;
  }
}

/** Lista las vacantes configuradas — para mostrarlas en la consola */
export function vacantesConfiguradas(): Record<string, number> {
  return parsearMapa(process.env.BUK_VACANCY_MAP) ?? {};
}
