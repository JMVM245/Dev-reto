import { test } from "node:test";
import assert from "node:assert/strict";
import { mapToBuk, MAPEO_DECISIONES } from "../lib/buk/mapper.ts";
import { postulationSchema } from "../lib/validation/schema.ts";

const payloadBase = {
  external_id: "li-2026-000123",
  applied_at: "2026-10-16",
  source: "linkedin" as const,
  job: { title: "Desarrollador Backend", reference: "DEV-BE-2026" },
  candidate: {
    first_name: "María",
    surname: "García López",
    email: "  Maria.Garcia@Example.COM ",
    phone: "3001234567",
    linkedin_url: "https://www.linkedin.com/in/maria",
    document_type: "cc",
    document_number: "1035987654",
    location: "Medellín",
    studies_level: "Educación superior completa",
    academic_degree: "Ingeniera de Sistemas",
    experience_years: 5,
    cv_url: "https://ejemplo.com/cv.pdf",
  },
};

const config = {
  selectionProcessId: 777,
  stageName: "Postulantes",
};

test("valida un payload completo", () => {
  const r = postulationSchema.safeParse(payloadBase);
  assert.equal(r.success, true);
});

test("rechaza un payload sin nombre", () => {
  const r = postulationSchema.safeParse({
    ...payloadBase,
    candidate: { ...payloadBase.candidate, first_name: "" },
  });
  assert.equal(r.success, false);
});

test("rechaza un correo inválido", () => {
  const r = postulationSchema.safeParse({
    ...payloadBase,
    candidate: { ...payloadBase.candidate, email: "no-es-correo" },
  });
  assert.equal(r.success, false);
});

test("rechaza una fecha con formato distinto a YYYY-MM-DD", () => {
  const r = postulationSchema.safeParse({ ...payloadBase, applied_at: "16/10/2026" });
  assert.equal(r.success, false);
});

test("normaliza el correo a minúsculas — es la clave de duplicados", () => {
  const input = postulationSchema.parse(payloadBase);
  const { applicant } = mapToBuk(input, config);
  assert.equal(applicant.email, "maria.garcia@example.com");
});

test("normaliza el teléfono a formato internacional colombiano", () => {
  const input = postulationSchema.parse(payloadBase);
  const { applicant } = mapToBuk(input, config);
  assert.equal(applicant.phone, "+573001234567");
});

test("envuelve cv_url en el objeto que exige BUK", () => {
  const input = postulationSchema.parse(payloadBase);
  const { applicant } = mapToBuk(input, config);
  assert.deepEqual(applicant.cv_url, { cv_url: "https://ejemplo.com/cv.pdf" });
});

test("la postulación incluye la vacante y la etapa obligatorias", () => {
  const input = postulationSchema.parse(payloadBase);
  const { application } = mapToBuk(input, config);
  assert.equal(application.selection_process_id, 777);
  assert.equal(application.process_stage_id, "Postulantes");
});

test("usa referrer 'external' para LinkedIn — el enum no tiene valor linkedin", () => {
  const input = postulationSchema.parse(payloadBase);
  const { application } = mapToBuk(input, config);
  assert.equal(application.referrer, "external");
});

test("conserva external_id y la vacante en atributos personalizados", () => {
  const input = postulationSchema.parse(payloadBase);
  const { application } = mapToBuk(input, config);
  assert.equal(application.custom_attributes?.external_id, "li-2026-000123");
  assert.equal(application.custom_attributes?.vacancy_reference, "DEV-BE-2026");
  assert.equal(application.custom_attributes?.vacancy_title, "Desarrollador Backend");
});

test("aplica valores por defecto cuando opcionales vienen vacíos", () => {
  const input = postulationSchema.parse({
    external_id: "x-1",
    applied_at: "2026-10-16",
    source: "linkedin",
    job: { title: "QA", reference: "QA-1" },
    candidate: {
      first_name: "Ana",
      surname: "Pérez",
      email: "ana@example.com",
      document_type: "cc",
      document_number: "1",
      phone: "",
      linkedin_url: "",
      location: "",
      studies_level: "",
      academic_degree: "",
      cv_url: "",
    },
  });
  const { applicant } = mapToBuk(input, config);

  assert.equal(applicant.phone, undefined);
  assert.equal(applicant.linkedin_url, undefined);
  assert.equal(applicant.cv_url, undefined);
  assert.equal(applicant.location_id, undefined);
  assert.equal(applicant.studies_level, undefined);
  assert.equal(applicant.experience_years, undefined);
});

test("cada decisión de mapeo documenta origen, destino y regla", () => {
  assert.ok(MAPEO_DECISIONES.length > 0);
  for (const d of MAPEO_DECISIONES) {
    assert.ok(d.campoOrigen.length > 0, "falta campoOrigen");
    assert.ok(d.campoBuk.length > 0, "falta campoBuk");
    assert.ok(d.regla.length > 0, "falta regla");
  }
});
