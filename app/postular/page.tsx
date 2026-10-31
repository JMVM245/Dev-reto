"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";

type Vacancy = { reference: string; title: string; company: string; location: string };
type VacancyResponse = { ok: boolean; modo?: "mock" | "real"; vacantes?: Vacancy[]; error?: string };
type ApplicationResponse = { ok: boolean; resultado?: string; conector?: "mock" | "real"; error?: string; campos_con_error?: string[] };

function todayLocal() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 10);
}

export default function PublicApplicationPage() {
  const [vacancies, setVacancies] = useState<Vacancy[]>([]);
  const [vacancyRef, setVacancyRef] = useState("");
  const [mode, setMode] = useState<"mock" | "real">("mock");
  const [cv, setCv] = useState<File | null>(null);
  const [uploadedCvUrl, setUploadedCvUrl] = useState("");
  const [uploadedCvPath, setUploadedCvPath] = useState("");
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [receipt, setReceipt] = useState<"sent" | "duplicate" | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/vacantes", { cache: "no-store" })
      .then(async (response) => {
        const data = await response.json() as VacancyResponse;
        if (!response.ok || !data.ok) throw new Error(data.error || "No se pudieron cargar las vacantes.");
        if (!active) return;
        const activeVacancies = data.vacantes ?? [];
        setVacancies(activeVacancies);
        setMode(data.modo ?? "mock");
        const requestedReference = new URLSearchParams(window.location.search).get("vacante");
        setVacancyRef(activeVacancies.find(job => job.reference === requestedReference)?.reference ?? activeVacancies[0]?.reference ?? "");
      })
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "No se pudieron cargar las vacantes."))
      .finally(() => { if (active) setLoadingJobs(false); });
    return () => { active = false; };
  }, []);

  async function submitApplication(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReceipt(null);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    if (!vacancyRef) { setError("Selecciona una vacante activa."); return; }
    if (!cv && !uploadedCvUrl) { setError("Adjunta tu hoja de vida en PDF."); return; }
    if (cv && (cv.size > 5 * 1024 * 1024 || (!cv.type.includes("pdf") && !cv.name.toLowerCase().endsWith(".pdf")))) {
      setError("El archivo debe ser un PDF de máximo 5 MB."); return;
    }

    setSubmitting(true);
    try {
      let cvUrl = uploadedCvUrl;
      let cvPath = uploadedCvPath;
      if (!cvUrl && cv) {
        const upload = new FormData();
        upload.append("cv", cv);
        const uploadResponse = await fetch("/api/cv", { method: "POST", body: upload });
        const uploadData = await uploadResponse.json() as { ok: boolean; cv_url?: string; cv_path?: string; error?: string };
        if (!uploadResponse.ok || !uploadData.ok || !uploadData.cv_url) throw new Error(uploadData.error || "No se pudo guardar la hoja de vida.");
        cvUrl = new URL(uploadData.cv_url, window.location.origin).toString();
        cvPath = uploadData.cv_path ?? "";
        setUploadedCvPath(cvPath);
        setUploadedCvUrl(cvUrl);
      }

      const email = String(form.get("email") ?? "").trim().toLowerCase();
      const externalId = typeof crypto !== "undefined" && "randomUUID" in crypto
        ? crypto.randomUUID()
        : `form-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const payload = {
        external_id: externalId,
        applied_at: todayLocal(),
        source: "linkedin",
        consentimiento_tratamiento_datos: form.get("consent") === "on",
        job: { reference: vacancyRef, title: vacancies.find(job => job.reference === vacancyRef)?.title ?? "" },
        candidate: {
          first_name: String(form.get("first_name") ?? "").trim(),
          surname: String(form.get("surname") ?? "").trim(),
          email,
          phone: String(form.get("phone") ?? "").trim(),
          linkedin_url: String(form.get("linkedin_url") ?? "").trim(),
          document_type: String(form.get("document_type") ?? ""),
          document_number: String(form.get("document_number") ?? "").trim(),
          location: String(form.get("location") ?? "").trim(),
          studies_level: String(form.get("studies_level") ?? "").trim(),
          academic_degree: String(form.get("academic_degree") ?? "").trim(),
          cv_url: cvUrl,
          cv_path: cvPath,
        },
      };
      const response = await fetch("/api/postulacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await response.json() as ApplicationResponse;
      if (!response.ok || !data.ok) {
        const details = data.campos_con_error?.join(" · ");
        throw new Error(details ? `${data.error ?? "Revisa los datos"} ${details}` : data.error ?? "No se pudo enviar la postulación.");
      }
      setReceipt(data.resultado === "duplicado" ? "duplicate" : "sent");
      formElement.reset();
      setCv(null);
      setUploadedCvUrl("");
      setUploadedCvPath("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "No se pudo enviar la postulación.");
    } finally {
      setSubmitting(false);
    }
  }

  const selectedJob = vacancies.find(job => job.reference === vacancyRef);

  return <main className="public-application-page">
    <header className="public-application-header">
      <Link href="/" className="public-application-brand"><span>d</span> DevSync <small>EMPLEOS</small></Link>
      <Link href="/buk" className="public-application-back">Panel de Buk</Link>
    </header>
    <div className="public-application-layout">
      <section className="public-application-intro">
        <span className="public-application-kicker">OPORTUNIDADES DE CARRERA</span>
        <h1>Postúlate a DevSync</h1>
        <p>Completa el formulario para que el equipo de selección revise tu perfil.</p>
        {mode === "mock" && <div className="public-demo-note"><b>Demo local</b><span>La postulación se procesa con el conector de Buk simulado; no se envía a una cuenta real.</span></div>}
        {selectedJob && <div className="public-selected-job"><small>VACANTE SELECCIONADA</small><b>{selectedJob.title}</b><span>{selectedJob.company} · {selectedJob.location}</span></div>}
      </section>

      <section className="public-application-card">
        {receipt ? <div className="public-application-receipt" role="status"><span>✓</span><h2>{receipt === "duplicate" ? "Ya recibimos tu postulación" : "Postulación recibida"}</h2><p>{receipt === "duplicate" ? "Ya existía una postulación tuya para esta vacante." : `Tu postulación para ${selectedJob?.title ?? "la vacante"} quedó registrada${mode === "mock" ? " en la demo de Buk" : " en Buk"}.`}</p><button type="button" onClick={() => setReceipt(null)}>Enviar otra postulación</button></div> : <>
          <div className="public-form-heading"><span>FORMULARIO DE POSTULACIÓN</span><h2>Tus datos</h2><p>Los campos marcados con * son obligatorios.</p></div>
          {error && <div className="public-form-error" role="alert">{error}</div>}
          {loadingJobs ? <p className="public-form-loading">Cargando vacantes…</p> : vacancies.length === 0 ? <p className="public-form-error">No hay vacantes activas para recibir postulaciones.</p> : <form onSubmit={submitApplication}>
            <label className="public-form-wide">Vacante a la que te postulas *<select required value={vacancyRef} onChange={event => setVacancyRef(event.target.value)}>{vacancies.map(job => <option key={job.reference} value={job.reference}>{job.title} · {job.location}</option>)}</select></label>
            <div className="public-form-grid">
              <label>Nombre *<input name="first_name" required maxLength={80} autoComplete="given-name"/></label>
              <label>Apellidos *<input name="surname" required maxLength={80} autoComplete="family-name"/></label>
              <label>Correo electrónico *<input name="email" type="email" required autoComplete="email"/></label>
              <label>Celular<input name="phone" type="tel" autoComplete="tel" placeholder="+57 300 000 0000"/></label>
              <label>Tipo de documento *<select name="document_type" required defaultValue="cc"><option value="cc">Cédula de ciudadanía</option><option value="ce">Cédula de extranjería</option><option value="ti">Tarjeta de identidad</option><option value="pp">Pasaporte</option></select></label>
              <label>Número de documento *<input name="document_number" required maxLength={30}/></label>
              <label>Ciudad / ubicación<input name="location" autoComplete="address-level2" placeholder="Medellín, Antioquia"/></label>
              <label>Nivel de estudios<select name="studies_level" defaultValue=""><option value="">Seleccionar</option><option value="Bachillerato">Bachillerato</option><option value="Técnico">Técnico</option><option value="Tecnólogo">Tecnólogo</option><option value="Educación superior incompleta">Educación superior incompleta</option><option value="Educación superior completa">Educación superior completa</option><option value="Posgrado">Posgrado</option></select></label>
              <label className="public-form-wide">Título o área de formación<input name="academic_degree" maxLength={120} placeholder="Ej. Tecnología en Desarrollo de Software"/></label>
              <label className="public-form-wide">Enlace a tu perfil de LinkedIn<input name="linkedin_url" type="url" placeholder="https://www.linkedin.com/in/tu-perfil"/></label>
              <label className="public-form-wide">Hoja de vida en PDF *<input type="file" accept="application/pdf,.pdf" required onChange={event => { setCv(event.target.files?.[0] ?? null); setUploadedCvUrl(""); setUploadedCvPath(""); }}/><small>PDF de máximo 5 MB.</small></label>
            </div>
            <label className="public-consent"><input type="checkbox" name="consent" required/><span>Autorizo el tratamiento de mis datos personales para gestionar esta postulación.</span></label>
            <button className="public-submit-button" type="submit" disabled={submitting || loadingJobs || vacancies.length === 0}>{submitting ? "Enviando postulación…" : "Enviar postulación"}</button>
            <small className="public-form-footnote">Al enviar, tus datos y tu hoja de vida se procesarán para esta vacante.</small>
          </form>}
        </>}
      </section>
    </div>
  </main>;
}
