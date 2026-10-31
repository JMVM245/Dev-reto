import { NextResponse } from "next/server";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { isPanelSessionValid, panelLoginConfigured } from "@/lib/panel-auth";
import { listApplications, supabaseConfigured, upsertApplications, type ApplicationRow } from "@/lib/supabase/rest";

export const dynamic = "force-dynamic";

/** La bandeja del ATS lee los registros entregados por el conector local. */
export async function GET(request: Request) {
  if ((panelLoginConfigured() && !isPanelSessionValid(request)) || (process.env.VERCEL && !panelLoginConfigured())) return NextResponse.json({ ok: false, error: "Inicia sesión para acceder a la bandeja del reclutador." }, { status: 401 });
  if (supabaseConfigured()) {
    try {
      const postulados = await listApplications();
      return NextResponse.json({ ok: true, simulacion: true, nota: "Postulaciones cargadas desde Supabase.", vacantes: [], postulados });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo consultar Supabase." }, { status: 502 });
    }
  }
  if (process.env.VERCEL) return NextResponse.json({ ok: false, error: "Configura Supabase antes de recibir postulaciones en Vercel." }, { status: 503 });
  let postulantes: unknown[] = [];
  try {
    const contenido = await readFile(join(process.cwd(), "data", "postulantes.json"), "utf8");
    const parsed: unknown = JSON.parse(contenido);
    if (Array.isArray(parsed)) postulantes = parsed;
  } catch { /* una base vacía o todavía no creada equivale a cero registros */ }

  return NextResponse.json({
    ok: true,
    simulacion: true,
    nota: postulantes.length ? "Postulantes cargados en la base local." : "No hay postulantes cargados.",
    vacantes: [],
    postulados: postulantes,
  });
}

export async function POST(request: Request) {
  if ((panelLoginConfigured() && !isPanelSessionValid(request)) || (process.env.VERCEL && !panelLoginConfigured())) return NextResponse.json({ ok: false, error: "Inicia sesión para modificar la bandeja del reclutador." }, { status: 401 });
  let body: { postulados?: unknown };
  try {
    body = await request.json() as { postulados?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "El cuerpo debe ser JSON." }, { status: 400 });
  }
  if (!Array.isArray(body.postulados)) {
    return NextResponse.json({ ok: false, error: "Falta la lista de postulantes." }, { status: 400 });
  }

  if (supabaseConfigured()) {
    const rows: ApplicationRow[] = body.postulados.flatMap((item, index) => {
      if (!item || typeof item !== "object") return [];
      const row = item as Record<string, unknown>;
      if (typeof row.nombre !== "string" || !row.nombre.trim() || typeof row.correo !== "string" || !row.correo.includes("@")) return [];
      const id = String(row.application_id ?? row.applicant_id ?? `CSV-${Date.now()}-${index}`);
      return [{
        application_id: id, applicant_id: String(row.applicant_id ?? id), nombre: row.nombre.trim(), correo: row.correo.trim().toLowerCase(),
        vacante_titulo: String(row.vacante_titulo ?? "Postulación importada"), vacante_referencia: String(row.vacante_referencia ?? "IMPORTACION-CSV"),
        etapa: String(row.etapa ?? "Postulantes"), fecha_postulacion: String(row.fecha_postulacion ?? new Date().toISOString().slice(0, 10)),
        origen: String(row.origen ?? "Importación CSV"), sync_status: String(row.sync_status ?? "Pendiente de enviar a Buk"),
        cv_url: typeof row.cv_url === "string" ? row.cv_url : "", linkedin_url: typeof row.linkedin_url === "string" ? row.linkedin_url : "",
        telefono: typeof row.telefono === "string" ? row.telefono : "", pais: typeof row.pais === "string" ? row.pais : "", ciudad: typeof row.ciudad === "string" ? row.ciudad : "",
        first_name: typeof row.first_name === "string" ? row.first_name : "", surname: typeof row.surname === "string" ? row.surname : "",
        document_type: typeof row.document_type === "string" ? row.document_type : "", document_number: typeof row.document_number === "string" ? row.document_number : "",
      }];
    });
    try {
      await upsertApplications(rows);
      const postulados = await listApplications();
      return NextResponse.json({ ok: true, guardados: rows.length, postulados });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudieron guardar los postulantes en Supabase." }, { status: 502 });
    }
  }
  if (process.env.VERCEL) return NextResponse.json({ ok: false, error: "Configura Supabase antes de importar postulantes en Vercel." }, { status: 503 });

  const archivo = join(process.cwd(), "data", "postulantes.json");
  let postulantes: Record<string, unknown>[] = [];
  try {
    const current: unknown = JSON.parse(await readFile(archivo, "utf8"));
    if (Array.isArray(current)) postulantes = current as Record<string, unknown>[];
  } catch { /* iniciar con bandeja vacía */ }

  let guardados = 0;
  for (const item of body.postulados) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (typeof record.nombre !== "string" || !record.nombre.trim() || typeof record.correo !== "string" || !record.correo.includes("@")) continue;
    const appId = String(record.application_id ?? record.applicant_id ?? `CSV-${Date.now()}-${guardados}`);
    record.application_id = appId;
    record.applicant_id = String(record.applicant_id ?? appId);
    const index = postulantes.findIndex(existing => existing.application_id === appId || (existing.correo === record.correo && existing.vacante_referencia === record.vacante_referencia));
    if (index >= 0) {
      record.application_id = postulantes[index].application_id;
      postulantes[index] = { ...postulantes[index], ...record };
    } else {
      postulantes.push(record);
    }
    guardados++;
  }

  await writeFile(archivo, `${JSON.stringify(postulantes, null, 2)}\n`, "utf8");
  return NextResponse.json({ ok: true, guardados, postulados: postulantes });
}
