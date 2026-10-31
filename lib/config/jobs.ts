export type JobStatus = "active" | "draft" | "closed";
export type Job = {
  reference: string;
  title: string;
  company: string;
  location: string;
  status: JobStatus;
  employment: string;
  posted: string;
};

/** Single source of truth shared by the recruiter panel and public form API. */
export const jobs: Job[] = [
  { reference: "DEV-BE-2026", title: "Desarrollador Backend", company: "DevSync", location: "Medellín, Antioquia · Híbrido", status: "active", employment: "Tiempo completo", posted: "Publicado hace 5 días" },
  { reference: "DEV-FS-2026", title: "Desarrollador Full Stack", company: "DevSync", location: "Medellín, Antioquia · Híbrido", status: "active", employment: "Tiempo completo", posted: "Publicado hoy" },
  { reference: "DA-2026", title: "Analista de Datos", company: "DevSync", location: "Medellín, Antioquia · Híbrido", status: "active", employment: "Tiempo completo", posted: "Publicado hace 1 semana" },
  { reference: "UX-2026", title: "Diseñador UX/UI", company: "DevSync", location: "Colombia · Remoto", status: "active", employment: "Tiempo completo", posted: "Publicado hace 2 semanas" },
  { reference: "SALES-2026", title: "Ejecutivo de ventas", company: "DevSync", location: "Colombia · Remoto", status: "closed", employment: "Tiempo completo", posted: "Cerrado hace 3 años" },
  { reference: "ACCOUNT-2026", title: "Ejecutivo de cuentas", company: "DevSync", location: "Medellín, Antioquia", status: "closed", employment: "Tiempo completo", posted: "Cerrado hace 6 años" },
  { reference: "QA-2026", title: "Asistente de calidad de software", company: "DevSync", location: "Medellín, Antioquia · Presencial", status: "draft", employment: "Tiempo completo", posted: "Borrador" },
];

export function findActiveJob(reference: string): Job | undefined {
  const normalized = reference.trim().toLowerCase();
  return jobs.find((job) => job.status === "active" && job.reference.toLowerCase() === normalized);
}
