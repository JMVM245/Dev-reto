"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type Applicant = {
  applicant_id: string;
  application_id: string;
  nombre: string;
  correo: string;
  vacante_titulo: string;
  vacante_referencia: string;
  etapa: string;
  fecha_postulacion: string;
  origen: string;
  cv_url: string;
  telefono: string;
  pais: string;
  ciudad: string;
  linkedin_url?: string;
};

const stages = ["Postulantes", "Revisión de CV", "Entrevista", "Finalista", "Descartado"];
const importedKey = "ceiba-imported-applicants";

function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (char === delimiter && !quoted) { row.push(cell.trim()); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += char;
  }
  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return rows;
}

const normalizedHeader = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

function applicantsFromCsv(text: string): Applicant[] {
  const rows = parseCsv(text.replace(/^\uFEFF/, ""));
  if (rows.length < 2) throw new Error("El CSV no contiene filas de postulantes.");
  const headers = rows[0].map(normalizedHeader);
  const find = (...aliases: string[]) => headers.findIndex(header => aliases.includes(header));
  const at = (row: string[], index: number) => index < 0 ? "" : row[index] ?? "";
  const emailIndex = find("email", "correo", "correoelectronico", "emailaddress");
  const fullNameIndex = find("nombrecompleto", "fullname", "name", "candidatename");
  const firstNameIndex = find("firstname", "nombres", "nombre");
  const lastNameIndex = find("lastname", "surname", "apellido", "apellidos", "primerapellido");
  if (emailIndex < 0 || (fullNameIndex < 0 && firstNameIndex < 0)) throw new Error("No encontré columnas de nombre y correo. Revisa los encabezados del CSV.");

  const phoneIndex = find("phone", "phonenumber", "telefono", "celular", "mobile");
  const cityIndex = find("city", "ciudad", "location", "ubicacion");
  const countryIndex = find("country", "pais");
  const cvIndex = find("cv", "cvurl", "resume", "resumeurl", "curriculum", "hojadevida", "attachmenturl");
  const jobIndex = find("jobtitle", "position", "vacancy", "vacante", "puesto", "cargopostulado");
  const dateIndex = find("applicationdate", "applieddate", "dateapplied", "fecha", "fechapostulacion");

  return rows.slice(1).map((row, index) => {
    const fullName = fullNameIndex >= 0 ? at(row, fullNameIndex) : [at(row, firstNameIndex), at(row, lastNameIndex)].filter(Boolean).join(" ");
    const email = at(row, emailIndex).toLowerCase();
    if (!fullName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
    const id = `CSV-${Date.now()}-${index}`;
    return {
      applicant_id: id, application_id: id, nombre: fullName, correo: email,
      vacante_titulo: at(row, jobIndex) || "Postulación general", vacante_referencia: "IMPORTACION-CSV",
      etapa: "Postulantes", fecha_postulacion: at(row, dateIndex) || new Date().toLocaleDateString("es-CO"),
      origen: "Importación CSV", cv_url: at(row, cvIndex), telefono: at(row, phoneIndex), pais: at(row, countryIndex), ciudad: at(row, cityIndex),
    } satisfies Applicant;
  }).filter((applicant): applicant is Applicant => applicant !== null);
}

export default function Home() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [importPreview, setImportPreview] = useState<Applicant[] | null>(null);
  const [importSkipped, setImportSkipped] = useState(0);
  const [importError, setImportError] = useState("");
  const [importNotice, setImportNotice] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState("Todos los postulados");
  const [view, setView] = useState<"list" | "pipeline">("list");
  const [stageOverrides, setStageOverrides] = useState<Record<string, string>>({});
  const [selected, setSelected] = useState<Applicant | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [stagesReady, setStagesReady] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/postulados", { cache: "no-store" });
      if (response.status === 401) { window.location.assign("/buk/login?next=/buk"); return; }
      if (!response.ok) throw new Error(`Error ${response.status} al cargar los postulados.`);
      const data = await response.json() as { postulados?: Applicant[] };
      setApplicants(data.postulados ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cargar la base de postulantes.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    try {
      if (localStorage.getItem("ceiba-data-reset-v2") !== "done") {
        localStorage.removeItem(importedKey);
        localStorage.removeItem("ceiba-application-stages");
        localStorage.setItem("ceiba-data-reset-v2", "done");
      } else {
        const saved = JSON.parse(localStorage.getItem("ceiba-application-stages") ?? "{}");
        if (saved && typeof saved === "object" && !Array.isArray(saved)) {
          setStageOverrides(saved as Record<string, string>);
        }
      }
    } catch { /* ignore malformed local demo settings */ }
    setStagesReady(true);
  }, [refresh]);

  useEffect(() => {
    if (!stagesReady) return;
    localStorage.setItem("ceiba-application-stages", JSON.stringify(stageOverrides));
  }, [stageOverrides, stagesReady]);

  async function readCsv(file?: File) {
    setImportError("");
    setImportNotice("");
    if (!file) return;
    try {
      if (!file.name.toLowerCase().endsWith(".csv")) throw new Error("Guarda primero el archivo de Excel como CSV UTF-8 y vuelve a cargarlo.");
      const parsed = applicantsFromCsv(await file.text());
      const known = new Set(applicants.map(applicant => applicant.correo.toLowerCase()));
      const unique: Applicant[] = [];
      for (const applicant of parsed) {
        if (known.has(applicant.correo.toLowerCase())) continue;
        known.add(applicant.correo.toLowerCase());
        unique.push(applicant);
      }
      setImportSkipped(parsed.length - unique.length);
      setImportPreview(unique);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No pude leer este CSV.");
      setImportPreview(null);
    }
  }

  async function confirmImport() {
    const batch = importPreview ?? [];
    try {
      const response = await fetch("/api/postulados", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postulados: batch }) });
      const data = await response.json() as { ok: boolean; error?: string; postulados?: Applicant[] };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "No se pudieron guardar los postulantes.");
      setApplicants(data.postulados ?? []);
      setImportNotice(`${batch.length} postulante${batch.length === 1 ? "" : "s"} importado${batch.length === 1 ? "" : "s"}.`);
      setStageFilter("Todos los postulados");
      setView("list");
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "No se pudo importar el archivo.");
    } finally {
      setImportPreview(null);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  const getStage = (applicant: Applicant) => stageOverrides[applicant.application_id] ?? applicant.etapa;
  const filtered = useMemo(() => applicants.filter(applicant => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || `${applicant.nombre} ${applicant.correo} ${applicant.telefono} ${applicant.ciudad} ${applicant.pais}`.toLowerCase().includes(q);
    const matchesStage = stageFilter === "Todos los postulados" || getStage(applicant) === stageFilter;
    return matchesSearch && matchesStage;
  }), [applicants, search, stageFilter, stageOverrides]);

  const cvHref = (applicant: Applicant) => {
    try {
      const url = new URL(applicant.cv_url, window.location.origin);
      return url.protocol === "https:" || (url.origin === window.location.origin && (url.protocol === "http:" || applicant.cv_url.startsWith("/"))) ? url.href : null;
    } catch { return null; }
  };

  function updateStage(applicant: Applicant, stage: string) {
    setStageOverrides(current => ({ ...current, [applicant.application_id]: stage }));
  }

  function exportCsv() {
    const header = ["Nombre", "Correo", "Celular", "País", "Ciudad", "Etapa", "CV"];
    const rows = filtered.map(a => [a.nombre, a.correo, a.telefono, a.pais, a.ciudad, getStage(a), a.cv_url]);
    const csv = [header, ...rows].map(row => row.map(value => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" }));
    link.href = objectUrl;
    link.download = "postulados-devsync.csv";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }

  const counts = Object.fromEntries(stages.map(stage => [stage, applicants.filter(a => getStage(a) === stage).length]));

  return <div className="ats-app">
    <header className="ats-topbar">
      <button className="ats-brand" onClick={() => { setView("list"); setStageFilter("Todos los postulados"); setSearch(""); }} aria-label="Inicio del ATS">
        <span className="ats-brand-mark">d</span><span>devsync<span className="ats-brand-dot">.</span></span><small>TALENTO</small>
      </button>
      <div className="ats-search"><span>⌕</span><input aria-label="Buscar postulante" placeholder="Buscar por nombre, correo, celular o ciudad" value={search} onChange={e => setSearch(e.target.value)} />{search && <button onClick={() => setSearch("")} aria-label="Limpiar búsqueda">×</button>}</div>
      <div className="ats-top-actions"><span className="ats-status"><i/> Demo local</span><button className="ats-refresh" onClick={() => void refresh()} disabled={loading}>{loading ? "Cargando…" : "↻ Actualizar"}</button></div>
    </header>

    <div className="ats-frame">
      <aside className="ats-sidebar">
        <div className="ats-side-label">SELECCIÓN</div>
        <button className={view === "list" && stageFilter === "Todos los postulados" ? "ats-side-link active" : "ats-side-link"} onClick={() => { setView("list"); setStageFilter("Todos los postulados"); }}><span>▤</span> Postulados <b>{applicants.length}</b></button>
        <button className={view === "pipeline" ? "ats-side-link active" : "ats-side-link"} onClick={() => { setView("pipeline"); setStageFilter("Todos los postulados"); }}><span>▥</span> Pipeline ATS</button>
        <div className="ats-side-divider"/>
        <div className="ats-side-label">ETAPAS</div>
        {stages.map(stage => <button key={stage} className={stageFilter === stage ? "ats-stage-link active" : "ats-stage-link"} onClick={() => { setStageFilter(stage); setView("list"); }}><span className={`ats-stage-dot stage-${stages.indexOf(stage)}`}/>{stage}<b>{counts[stage] ?? 0}</b></button>)}
        <div className="ats-side-note"><span>ⓘ</span><p>Este ATS muestra los candidatos importados por el reclutador y las postulaciones enviadas desde el panel de empleos.</p></div>
      </aside>

      <main className="ats-main">
        <div className="ats-page-heading"><div><div className="ats-breadcrumb">DEVSYNC <span>/</span> SELECCIÓN</div><h1>{view === "pipeline" ? "Pipeline de selección" : stageFilter === "Todos los postulados" ? "Postulados" : stageFilter}</h1><p>Administra candidatos y revisa sus hojas de vida desde un solo panel.</p>{importNotice && <small className="ats-import-notice">{importNotice}</small>}</div><div className="ats-heading-actions"><a className="ats-refresh" href="/postular">Formulario público</a><input ref={fileInput} className="ats-file-input" type="file" accept=".csv,text/csv" onChange={event => void readCsv(event.target.files?.[0])} aria-label="Seleccionar CSV de postulaciones"/><button className="ats-import-button" onClick={() => fileInput.current?.click()}>⇧ <span>Importar CSV</span></button><button className="ats-export" onClick={exportCsv}>⇩ <span>Exportar CSV</span></button></div></div>

        <section className="ats-stats">
          <article><span>Total postulados</span><b>{applicants.length}</b><small>Precargados e importados</small></article>
          <article><span>Revisión de CV</span><b>{counts["Revisión de CV"] ?? 0}</b><small>Candidatos en revisión</small></article>
          <article><span>Entrevistas</span><b>{counts.Entrevista ?? 0}</b><small>En proceso de selección</small></article>
          <article><span>Hojas de vida</span><b>{applicants.filter(a => Boolean(cvHref(a))).length}</b><small>Con enlace disponible</small></article>
        </section>

        <section className="ats-card">
          <div className="ats-card-header"><div><h2>{view === "pipeline" ? "Flujo por etapas" : "Base de postulados"}</h2><p>{filtered.length} registros · enviados e importados</p></div><div className="ats-controls"><select value={stageFilter} onChange={e => { setStageFilter(e.target.value); if (e.target.value !== "Todos los postulados") setView("list"); }} aria-label="Filtrar por etapa"><option>Todos los postulados</option>{stages.map(stage => <option key={stage}>{stage}</option>)}</select><div className="ats-view-toggle"><button className={view === "list" ? "selected" : ""} onClick={() => setView("list")} aria-label="Vista de lista">☷</button><button className={view === "pipeline" ? "selected" : ""} onClick={() => { setView("pipeline"); setStageFilter("Todos los postulados"); }} aria-label="Vista pipeline">▥</button></div></div></div>

          {error && <div className="ats-error">{error}<button onClick={() => void refresh()}>Reintentar</button></div>}
          {loading && applicants.length === 0 ? <div className="ats-empty">Cargando postulantes…</div> : view === "list" ? <div className="ats-table-wrap"><table className="devsync-ats-table"><thead><tr><th>POSTULANTE</th><th>CONTACTO</th><th>UBICACIÓN</th><th>HOJA DE VIDA</th><th>ETAPA</th></tr></thead><tbody>{filtered.map(applicant => <tr key={applicant.application_id}><td><button className="ats-person" onClick={() => setSelected(applicant)}><span className="ats-person-avatar">{applicant.nombre.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{applicant.nombre}</b><small>{applicant.vacante_titulo}</small></span></button></td><td><span className="ats-contact-email">{applicant.correo}</span><small className="ats-contact-phone">{applicant.telefono || "Sin celular"}</small></td><td><b>{applicant.ciudad || "—"}</b><small className="ats-contact-phone">{applicant.pais || "—"}</small></td><td>{cvHref(applicant) ? <a className="ats-cv-link" href={cvHref(applicant)!} target="_blank" rel="noreferrer">↗ Ver CV</a> : <span className="ats-no-cv">Sin enlace</span>}</td><td><select className="ats-stage-select" aria-label={`Etapa para ${applicant.nombre}`} value={getStage(applicant)} onChange={e => updateStage(applicant, e.target.value)}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="ats-empty">No hay postulantes que coincidan con la búsqueda o etapa seleccionada.</div>}</div> : <div className="ats-pipeline">{stages.map((stage, index) => <section className="ats-pipeline-lane" key={stage}><header><span className={`ats-stage-dot stage-${index}`}/><b>{stage}</b><i>{filtered.filter(a => getStage(a) === stage).length}</i></header>{filtered.filter(a => getStage(a) === stage).map(applicant => <article className="ats-pipeline-card" key={applicant.application_id}><button className="ats-person" onClick={() => setSelected(applicant)}><span className="ats-person-avatar">{applicant.nombre.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span><span><b>{applicant.nombre}</b><small>{applicant.correo}</small></span></button><p>{applicant.ciudad}, {applicant.pais}</p><div><select aria-label={`Etapa para ${applicant.nombre}`} value={getStage(applicant)} onChange={e => updateStage(applicant, e.target.value)}>{stages.map(option => <option key={option}>{option}</option>)}</select>{cvHref(applicant) && <a className="ats-cv-link" href={cvHref(applicant)!} target="_blank" rel="noreferrer">CV ↗</a>}</div></article>)}</section>)}</div>}
          <footer className="ats-card-footer">Los candidatos importados y los envíos exitosos desde el panel de reclutamiento se guardan en esta bandeja local.</footer>
        </section>
      </main>
    </div>

    {selected && <div className="ats-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setSelected(null); }}><section className="ats-detail"><button className="ats-detail-close" onClick={() => setSelected(null)} aria-label="Cerrar">×</button><div className="ats-detail-top"><span className="ats-person-avatar big">{selected.nombre.split(/\s+/).map(part => part[0]).slice(0, 2).join("").toUpperCase()}</span><div><div className="ats-breadcrumb">FICHA DE POSTULANTE</div><h2>{selected.nombre}</h2><p>{selected.vacante_titulo}</p></div></div><div className="ats-detail-grid"><div><span>Correo</span><b>{selected.correo}</b></div><div><span>Celular</span><b>{selected.telefono || "—"}</b></div><div><span>Ciudad</span><b>{selected.ciudad || "—"}</b></div><div><span>País</span><b>{selected.pais || "—"}</b></div><div><span>Etapa</span><b>{getStage(selected)}</b></div><div><span>Origen</span><b>{selected.origen || "Base de demostración"}</b></div><div><span>LinkedIn</span><b>{selected.linkedin_url ? <a href={selected.linkedin_url} target="_blank" rel="noreferrer">Ver perfil ↗</a> : "—"}</b></div></div><label className="ats-detail-stage">Etapa del proceso<select value={getStage(selected)} onChange={e => updateStage(selected, e.target.value)}>{stages.map(stage => <option key={stage}>{stage}</option>)}</select></label>{cvHref(selected) ? <a className="ats-detail-cv" href={cvHref(selected)!} target="_blank" rel="noreferrer">↗ Abrir hoja de vida</a> : <div className="ats-no-cv">No hay enlace de hoja de vida para este postulante.</div>}</section></div>}
    {importError && <div className="ats-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setImportError(""); }}><section className="ats-import-dialog"><button className="ats-detail-close" onClick={() => setImportError("")} aria-label="Cerrar">×</button><div className="ats-breadcrumb">IMPORTAR POSTULANTES</div><h2>No se pudo importar el archivo</h2><p>{importError}</p><button className="ats-import-button" onClick={() => setImportError("")}>Entendido</button></section></div>}
    {importPreview && <div className="ats-modal-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) setImportPreview(null); }}><section className="ats-import-dialog"><button className="ats-detail-close" onClick={() => setImportPreview(null)} aria-label="Cerrar">×</button><div className="ats-breadcrumb">IMPORTAR POSTULANTES</div><h2>Revisa antes de agregar</h2><p>Se detectaron <b>{importPreview.length}</b> filas válidas. {importSkipped > 0 && `${importSkipped} duplicadas se omitirán.`} Revisa la muestra y confirma para agregarlas al ATS.</p>{importPreview.length > 0 ? <div className="ats-preview-table"><table><thead><tr><th>Nombre</th><th>Correo</th><th>Vacante</th></tr></thead><tbody>{importPreview.slice(0, 5).map(applicant => <tr key={applicant.application_id}><td>{applicant.nombre}</td><td>{applicant.correo}</td><td>{applicant.vacante_titulo}</td></tr>)}</tbody></table>{importPreview.length > 5 && <small>y {importPreview.length - 5} más</small>}</div> : <p>Todo el contenido ya está en la base o no hay filas válidas.</p>}<div className="ats-import-dialog-actions"><button className="ats-export" onClick={() => setImportPreview(null)}>Cancelar</button><button className="ats-import-button" onClick={confirmImport} disabled={importPreview.length === 0}>Agregar al ATS</button></div></section></div>}
  </div>;
}
