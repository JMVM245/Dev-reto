const TABLE = "postulaciones";
const BUCKET = "hojas-de-vida";

export function supabaseConfigured() {
  return Boolean(process.env.SUPABASE_URL?.trim() && (process.env.SUPABASE_SECRET_KEY?.trim() || process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()));
}

function config() {
  const url = process.env.SUPABASE_URL?.trim().replace(/\/$/, "");
  const secretKey = process.env.SUPABASE_SECRET_KEY?.trim();
  const legacyServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const key = secretKey || legacyServiceRoleKey;
  if (!url || !key) throw new Error("Configura SUPABASE_URL y SUPABASE_SECRET_KEY en las variables de entorno.");
  return { url, key, authorization: secretKey ? undefined : `Bearer ${key}` };
}

async function request(path: string, init: RequestInit = {}) {
  const { url, key, authorization } = config();
  const response = await fetch(`${url}${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      apikey: key,
      ...(authorization ? { Authorization: authorization } : {}),
      ...(init.body && !(init.body instanceof ArrayBuffer) && !(init.body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const raw = await response.text();
  let data: unknown = null;
  try { data = raw ? JSON.parse(raw) : null; } catch { data = raw; }
  if (!response.ok) {
    const detail = typeof data === "object" && data !== null && "message" in data ? String(data.message) : `Supabase respondió ${response.status}.`;
    const error = new Error(detail) as Error & { status?: number; code?: string };
    error.status = response.status;
    if (typeof data === "object" && data !== null && "code" in data) error.code = String(data.code);
    throw error;
  }
  return data;
}

export type ApplicationRow = {
  application_id: string; applicant_id: string; nombre: string; correo: string;
  vacante_titulo: string; vacante_referencia: string; etapa: string;
  fecha_postulacion: string; origen: string; sync_status: string; cv_path?: string | null;
  cv_url?: string | null; linkedin_url?: string | null; telefono?: string | null;
  pais?: string | null; ciudad?: string | null; first_name?: string | null; surname?: string | null;
  document_type?: string | null; document_number?: string | null;
  consentimiento_tratamiento_datos?: boolean; consentimiento_fecha?: string | null;
  evaluacion_preseleccion?: unknown;
};

export async function uploadResume(path: string, bytes: Uint8Array) {
  const { url, key, authorization } = config();
  const response = await fetch(`${url}/storage/v1/object/${BUCKET}/${path}`, {
    method: "POST",
    cache: "no-store",
    headers: { apikey: key, ...(authorization ? { Authorization: authorization } : {}), "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes as unknown as BodyInit,
  });
  if (!response.ok) throw new Error(`No se pudo guardar el PDF en Supabase Storage (${response.status}).`);
}

export async function signedResumeUrl(path: string) {
  const result = await request(`/storage/v1/object/sign/${BUCKET}/${encodeURIComponent(path)}`, {
    method: "POST", body: JSON.stringify({ expiresIn: 3600 }),
  }) as { signedURL?: string };
  if (!result.signedURL) throw new Error("Supabase no devolvió un enlace temporal para la hoja de vida.");
  const { url } = config();
  return result.signedURL.startsWith("http") ? result.signedURL : `${url}/storage/v1${result.signedURL}`;
}

export async function findApplication(email: string, vacancyReference: string) {
  const params = new URLSearchParams({ select: "application_id,applicant_id", correo: `eq.${email.toLowerCase()}`, vacante_referencia: `eq.${vacancyReference}`, limit: "1" });
  const rows = await request(`/rest/v1/${TABLE}?${params}`) as Pick<ApplicationRow, "application_id" | "applicant_id">[];
  return rows[0] ?? null;
}

export async function insertApplication(row: ApplicationRow) {
  await request(`/rest/v1/${TABLE}`, {
    method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ ...row, correo: row.correo.toLowerCase() }),
  });
}

export async function listApplications() {
  const rows = await request(`/rest/v1/${TABLE}?select=*&order=created_at.desc`) as ApplicationRow[];
  return Promise.all(rows.map(async row => ({
    ...row,
    cv_url: row.cv_path ? await signedResumeUrl(row.cv_path) : row.cv_url ?? "",
  })));
}

export async function upsertApplications(rows: ApplicationRow[]) {
  if (!rows.length) return;
  await request(`/rest/v1/${TABLE}?on_conflict=correo,vacante_referencia`, {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify(rows.map(row => ({ ...row, correo: row.correo.toLowerCase() }))),
  });
}

export async function updateApplicationStatus(applicationId: string, updates: Record<string, unknown>) {
  const params = new URLSearchParams({ application_id: `eq.${applicationId}` });
  await request(`/rest/v1/${TABLE}?${params}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify(updates) });
}
