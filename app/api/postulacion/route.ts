import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { postulationSchema } from "@/lib/validation/schema";
import { createBukClient } from "@/lib/buk";
import { mapToBuk, MAPEO_DECISIONES } from "@/lib/buk/mapper";
import { BukApiError } from "@/lib/buk/client";
import { evaluarPostulacion } from "@/lib/rules/duplicates";
import { resolverVacante } from "@/lib/config/vacancies";
import { BukClientMock } from "@/lib/buk/mock";
import { Traza } from "@/lib/trace/traza";
import { buscarEscenario } from "@/lib/test/escenarios";
import { evaluateScreening } from "@/lib/screening/evaluator";
import { findActiveJob } from "@/lib/config/jobs";
import { findApplication, insertApplication, supabaseConfigured, type ApplicationRow } from "@/lib/supabase/rest";

/**
 * POST /api/postulacion
 *
 * El núcleo del conector. Recibe una postulación simulada de LinkedIn y la
 * empuja al apartado Postulados del BUK existente.
 *
 * Flujo síncrono en seis pasos:
 *
 *   1. Validar el payload (Zod)
 *   2. Resolver la vacante de destino
 *   3. Detectar duplicados e idempotencia
 *   4. Transformar al esquema de BUK
 *   5. Registrar en BUK (postulante -> postulación)
 *   6. Devolver la traza completa
 *
 * Síncrono a propósito: BUK no tiene webhooks de selección (verificado en
 * la documentación), así que no hay evento que dispare un proceso
 * diferido. El MVP pide funcionalidades mínimas.
 *
 * Acepta dos formas:
 *   - { "escenario": "nueva" }        -> usa un escenario de prueba predefinido
 *   - { "payload": { ... } }          -> payload arbitrario (p. ej. Postman)
 */

interface ConfigBuk {
  stageName: string;
  referrer?: string;
}

function getConfigBuk(): ConfigBuk {
  return {
    stageName: process.env.BUK_STAGE_NAME?.trim() || "Postulantes",
    referrer: process.env.BUK_REFERRER?.trim() || undefined,
  };
}

async function guardarEnBandejaLocal(postulante: Record<string, unknown>) {
  if (supabaseConfigured()) {
    await insertApplication(postulante as ApplicationRow);
    return;
  }
  if (process.env.VERCEL) throw new Error("Configura Supabase antes de recibir postulaciones en Vercel.");
  const archivo = join(process.cwd(), "data", "postulantes.json");
  let postulantes: Record<string, unknown>[] = [];
  try {
    const contenido = await readFile(archivo, "utf8");
    const parsed: unknown = JSON.parse(contenido);
    if (Array.isArray(parsed)) postulantes = parsed as Record<string, unknown>[];
  } catch { /* iniciar la bandeja vacía */ }

  const index = postulantes.findIndex((item) => item.application_id === postulante.application_id);
  if (index >= 0) {
    const anterior = postulantes[index];
    postulantes[index] = {
      ...anterior,
      ...postulante,
      // Preserve the source and metadata already stored during CSV import.
      origen: anterior.origen ?? postulante.origen,
    };
  }
  else postulantes.unshift(postulante);
  await writeFile(archivo, `${JSON.stringify(postulantes, null, 2)}\n`, "utf8");
}

export async function POST(request: Request) {
  const traza = new Traza();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    traza.registrar("recepcion", "Recepción", "error", "El cuerpo no es JSON válido.");
    return NextResponse.json(
      { ok: false, traza: traza.pasos, error: "El cuerpo no es JSON válido." },
      { status: 400 },
    );
  }

  // ── Resolución del payload ─────────────────────────────────────
  const obj = (body ?? {}) as { escenario?: unknown; payload?: unknown };
  let payloadCrudo: unknown;

  if (typeof obj.escenario === "string") {
    const esc = buscarEscenario(obj.escenario);
    if (!esc) {
      traza.registrar(
        "escenario",
        "Escenario",
        "error",
        `No existe el escenario "${obj.escenario}".`,
      );
      return NextResponse.json(
        { ok: false, traza: traza.pasos, error: `Escenario desconocido: ${obj.escenario}` },
        { status: 400 },
      );
    }
    payloadCrudo = esc.construir();
    traza.registrar("escenario", "Escenario", "ok", `${esc.titulo} — ${esc.esperado}`);

    if (esc.forzarErrorBuk) {
      // Se resuelve más abajo, cuando ya hay conector.
      traza.registrar(
        "simulacion",
        "Simulación de fallo",
        "aviso",
        `Se forzará un ${esc.forzarErrorBuk} del BUK para probar el reintento.`,
      );
    }
  } else {
    payloadCrudo = obj.payload ?? body;
  }

  // ── 1. VALIDACIÓN ────────────────────────────────────────────────
  const parsed = postulationSchema.safeParse(payloadCrudo);
  if (!parsed.success) {
    const campos = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
    traza.registrar("validacion", "Validación", "error", campos.join(" · "));

    return NextResponse.json(
      {
        ok: false,
        traza: traza.pasos,
        error: "Payload inválido — no se tocó el BUK.",
        paso: "validacion",
        campos_con_error: campos,
      },
      { status: 400 },
    );
  }
  traza.registrar(
    "validacion",
    "Validación",
    "ok",
    "Payload válido según el contrato del equipo (Zod).",
  );

  const parsedInput = parsed.data;
  if (parsedInput.consentimiento_tratamiento_datos === false) {
    return NextResponse.json({ ok: false, error: "Se requiere aceptar el tratamiento de datos para continuar.", paso: "consentimiento", traza: traza.pasos }, { status: 400 });
  }
  const configuredJob = findActiveJob(parsedInput.job.reference);
  if (!configuredJob) {
    return NextResponse.json({ ok: false, error: "La vacante no existe o ya no está recibiendo postulaciones.", paso: "vacante", traza: traza.pasos }, { status: 400 });
  }
  const input = {
    ...parsedInput,
    job: { ...parsedInput.job, reference: configuredJob.reference, title: configuredJob.title },
  };
  const evaluacion = input.screening ? evaluateScreening(input.screening) : undefined;
  if (evaluacion) {
    traza.registrar(
      "preseleccion",
      "Preselección",
      evaluacion.estado === "Descartado" || evaluacion.estado === "No cumple" ? "aviso" : "ok",
      `Resultado ${evaluacion.estado}: ${evaluacion.cumple}/${evaluacion.total} criterios (${evaluacion.porcentaje}%).`,
    );
    if (evaluacion.estado === "Descartado" || evaluacion.estado === "No cumple") {
      return NextResponse.json({
        ok: false,
        error: "La preselección no habilita el envío a Buk.",
        paso: "preseleccion",
        evaluacion,
        traza: traza.pasos,
      }, { status: 422 });
    }
  }

  // ── 2. VACANTE DE DESTINO ────────────────────────────────────────
  const vacante = resolverVacante(input.job.reference);
  if (!vacante.ok) {
    traza.registrar("vacante", "Vacante", "error", vacante.error);
    return NextResponse.json(
      { ok: false, traza: traza.pasos, error: vacante.error, paso: "vacante" },
      { status: 500 },
    );
  }
  traza.registrar(
    "vacante",
    "Vacante",
    "ok",
    `"${input.job.reference}" → selection_process_id ${vacante.selectionProcessId} (origen: ${vacante.origen}).`,
  );

  if (process.env.VERCEL && !supabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "El formulario todavía no está conectado a Supabase." }, { status: 503 });
  }
  if (supabaseConfigured()) {
    try {
      const existing = await findApplication(input.candidate.email, input.job.reference);
      if (existing) {
        traza.registrar("duplicados", "Duplicados", "duplicado", "Ya hay una postulación con este correo para esta vacante.");
        return NextResponse.json({ ok: true, resultado: "duplicado", applicant_id: existing.applicant_id, mensaje: "Ya existe una postulación para esta vacante.", traza: traza.pasos, total_ms: traza.totalMs });
      }
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo consultar Supabase.", paso: "supabase", traza: traza.pasos }, { status: 502 });
    }
  }

  const config = getConfigBuk();
  const client = createBukClient();

  // Fallo forzado por escenario — se aplica SOLO al simulador.
  // forzarError es estático en BukClientMock: hay que invocarlo en la clase,
  // no en la instancia (por eso se comprueba instanceof, no "in").
  const esc = typeof obj.escenario === "string" ? buscarEscenario(obj.escenario) : undefined;
  if (esc?.forzarErrorBuk && client instanceof BukClientMock) {
    BukClientMock.forzarError(esc.forzarErrorBuk);
  }

  const payloads = mapToBuk(input, {
    selectionProcessId: vacante.selectionProcessId,
    stageName: config.stageName,
    referrer: config.referrer,
  });

  // ── 3. DUPLICADOS E IDEMPOTENCIA ─────────────────────────────────
  let decision;
  try {
    decision = await evaluarPostulacion(client, input, vacante.selectionProcessId);
    traza.registrar(
      "duplicados",
      "Duplicados",
      decision.tipo === "duplicado" ? "duplicado" : "ok",
      decision.motivo,
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    traza.registrar("duplicados", "Duplicados", "error", msg);
    return NextResponse.json(
      { ok: false, traza: traza.pasos, error: msg, paso: "duplicados", reintentable: true },
      { status: 502 },
    );
  }

  if (decision.tipo === "duplicado") {
    return NextResponse.json({
      ok: true,
      resultado: "duplicado",
      applicant_id: decision.applicantId,
      mensaje: decision.motivo,
      traza: traza.pasos,
      total_ms: traza.totalMs,
    });
  }

  // ── 4 y 5. TRANSFORMAR Y REGISTRAR EN EL BUK ────────────────────
  traza.registrar(
    "transformacion",
    "Transformación",
    "ok",
    `Se mapean ${MAPEO_DECISIONES.length} decisiones al esquema del BUK.`,
  );

  try {
    const applicantId =
      decision.tipo === "reutilizar"
        ? decision.applicantId
        : String((await client.createApplicant(payloads.applicant)).id);

    traza.registrar(
      "postulante",
      "Postulante",
      "ok",
      decision.tipo === "reutilizar"
        ? `Se reutiliza la ficha existente ${applicantId}.`
        : `Ficha creada en el BUK con id ${applicantId}.`,
    );

    const application = await client.createApplication({
      ...payloads.application,
      applicant_id: applicantId,
    });

    const applicationStage = application.process_stage?.name ?? config.stageName;
    try {
      await guardarEnBandejaLocal({
        applicant_id: applicantId,
        application_id: input.external_id,
        nombre: `${input.candidate.first_name} ${input.candidate.surname}`.trim(),
        correo: input.candidate.email,
        vacante_titulo: input.job.title,
        vacante_referencia: input.job.reference,
        etapa: applicationStage,
        fecha_postulacion: input.applied_at,
        origen: input.source === "linkedin" ? "LinkedIn · formulario DevSync" : "Formulario DevSync",
        sync_status: "Enviado a Buk",
        cv_url: input.candidate.cv_url ?? "",
        cv_path: input.candidate.cv_path ?? "",
        linkedin_url: input.candidate.linkedin_url ?? "",
        telefono: input.candidate.phone ?? "",
        pais: "",
        ciudad: input.candidate.location ?? "",
        first_name: input.candidate.first_name,
        surname: input.candidate.surname,
        document_type: input.candidate.document_type,
        document_number: input.candidate.document_number,
        ...(input.consentimiento_tratamiento_datos === true ? {
          consentimiento_tratamiento_datos: true,
          consentimiento_fecha: new Date().toISOString(),
        } : {}),
        ...(evaluacion ? { evaluacion_preseleccion: evaluacion } : {}),
      });
      traza.registrar("bandeja_local", "Bandeja de Buk demo", "ok", "La postulación también quedó visible en el panel Postulados de la demo.");
    } catch (err) {
      const mensajeBandeja = err instanceof Error ? err.message : "No se pudo actualizar la bandeja del reclutador.";
      traza.registrar("bandeja_local", "Bandeja de Buk demo", "error", mensajeBandeja);
      return NextResponse.json({
        ok: false,
        error: "Buk recibió la postulación, pero no se pudo guardar en la bandeja de DevSync. No la reenvíes todavía; el reclutador debe revisar la conexión.",
        paso: "supabase",
        traza: traza.pasos,
      }, { status: 502 });
    }

    traza.registrar(
      "postulacion",
      "Postulación",
      "ok",
      `Ligada a la vacante ${vacante.selectionProcessId}, etapa "${applicationStage}".`,
    );

    return NextResponse.json({
      ok: true,
      resultado: decision.tipo === "reutilizar" ? "reutilizado" : "creado",
      applicant_id: applicantId,
      application_id: String(application.id),
      vacante: {
        id: vacante.selectionProcessId,
        referencia: input.job.reference,
        origen: vacante.origen,
      },
      etapa: applicationStage,
      conector: client.mode,
      mensaje: decision.motivo,
      ...(evaluacion ? { evaluacion } : {}),
      traza: traza.pasos,
      total_ms: traza.totalMs,
    });
  } catch (err) {
    const bukError = err instanceof BukApiError;
    const mensaje = err instanceof Error ? err.message : String(err);
    const reintentable = bukError ? (err as BukApiError).retryable : false;

    traza.registrar(
      "registro_buk",
      "Registro en BUK",
      "error",
      `${mensaje}${reintentable ? " — reintentable." : " — requiere revisión."}`,
    );

    return NextResponse.json(
      {
        ok: false,
        traza: traza.pasos,
        error: mensaje,
        paso: "registro_buk",
        reintentable,
      },
      { status: 502 },
    );
  }
}
