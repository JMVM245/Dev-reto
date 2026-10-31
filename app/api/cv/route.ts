import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { supabaseConfigured, uploadResume, signedResumeUrl } from "@/lib/supabase/rest";

export const runtime = "nodejs";
const MAX_CV_BYTES = 5 * 1024 * 1024;

export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ ok: false, error: "Envía el archivo como formulario multipart." }, { status: 400 });
  }

  const file = form.get("cv");
  if (!(file instanceof File)) {
    return NextResponse.json({ ok: false, error: "Adjunta tu hoja de vida en PDF." }, { status: 400 });
  }
  if (file.size === 0 || file.size > MAX_CV_BYTES) {
    return NextResponse.json({ ok: false, error: "El PDF debe pesar entre 1 byte y 5 MB." }, { status: 400 });
  }
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    return NextResponse.json({ ok: false, error: "La hoja de vida debe ser un PDF." }, { status: 400 });
  }

  const contents = Buffer.from(await file.arrayBuffer());
  if (contents.subarray(0, 5).toString("ascii") !== "%PDF-") {
    return NextResponse.json({ ok: false, error: "El archivo no tiene una firma PDF válida." }, { status: 400 });
  }

  const filename = `cv-${randomUUID()}.pdf`;
  if (supabaseConfigured()) {
    try {
      await uploadResume(filename, contents);
      const cvUrl = await signedResumeUrl(filename);
      return NextResponse.json({ ok: true, cv_url: cvUrl, cv_path: filename, nombre_archivo: file.name });
    } catch (error) {
      return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "No se pudo guardar la hoja de vida." }, { status: 502 });
    }
  }
  if (process.env.VERCEL) {
    return NextResponse.json({ ok: false, error: "Configura Supabase para guardar hojas de vida en el despliegue." }, { status: 503 });
  }
  const directory = join(process.cwd(), "data", "cv");
  await mkdir(directory, { recursive: true });
  await writeFile(join(directory, filename), contents, { flag: "wx" });

  return NextResponse.json({ ok: true, cv_url: `/api/cv/${filename}`, cv_path: filename, nombre_archivo: file.name });
}
