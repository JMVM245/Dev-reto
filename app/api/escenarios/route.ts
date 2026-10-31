import { NextResponse } from "next/server";
import { ESCENARIOS } from "@/lib/test/escenarios";

/**
 * GET /api/escenarios
 *
 * Devuelve los escenarios de prueba disponibles, con el payload que cada
 * uno enviaría. La consola los muestra para que el equipo sepa qué va a
 * pasar antes de enviar.
 */
export async function GET() {
  return NextResponse.json({
    ok: true,
    escenarios: ESCENARIOS.map((e) => ({
      clave: e.clave,
      titulo: e.titulo,
      descripcion: e.descripcion,
      esperado: e.esperado,
      ejemplo: e.construir(),
      forzarErrorBuk: e.forzarErrorBuk ?? null,
    })),
  });
}
