import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { BukClientMock, resetSimulacion } from "../lib/buk/mock.ts";
import { evaluarPostulacion } from "../lib/rules/duplicates.ts";
import { postulationSchema } from "../lib/validation/schema.ts";

const VACANTE_A = 123; // DEV-BE-2026 — sembrada en el simulador
const VACANTE_B = 456; // DA-2026

function payload(email: string, reference = "DEV-BE-2026") {
  return postulationSchema.parse({
    external_id: "ext-1",
    applied_at: "2026-10-16",
    source: "linkedin",
    job: { title: "Backend", reference },
    candidate: {
      first_name: "María",
      surname: "García",
      email,
      document_type: "cc",
      document_number: "1035987654",
    },
  });
}

beforeEach(() => {
  resetSimulacion();
});

test("el BUK simulado arranca sembrado con un candidato existente", async () => {
  const client = new BukClientMock();
  const carlos = await client.findApplicantByEmail("carlos.mendoza@example.com");
  assert.ok(carlos, "Carlos Mendoza debe venir sembrado");
  assert.equal(String(carlos.id), "900");
});

test("correo nuevo -> decide crear", async () => {
  const client = new BukClientMock();
  const d = await evaluarPostulacion(client, payload("nuevo@example.com"), VACANTE_A);
  assert.equal(d.tipo, "crear");
});

test("el candidato sembrado en la MISMA vacante -> duplicado", async () => {
  const client = new BukClientMock();
  const d = await evaluarPostulacion(
    client,
    payload("CARLOS.MENDOZA@example.com"),
    VACANTE_A,
  );
  assert.equal(d.tipo, "duplicado");
  assert.equal(d.applicantId, "900");
});

test("el candidato sembrado en OTRA vacante -> NO es duplicado, se reutiliza", async () => {
  const client = new BukClientMock();
  const d = await evaluarPostulacion(client, payload("carlos.mendoza@example.com"), VACANTE_B);
  assert.equal(d.tipo, "reutilizar");
  assert.equal(d.applicantId, "900");
});

test("el correo con mayúsculas y espacios se reconoce como la misma persona", async () => {
  const client = new BukClientMock();
  const d = await evaluarPostulacion(client, payload("  Carlos.Mendoza@Example.com "), VACANTE_A);
  assert.equal(d.tipo, "duplicado");
});

test("el conector simulado rechaza un postulante sin nombre", async () => {
  const client = new BukClientMock();
  await assert.rejects(
    () => client.createApplicant({ first_name: "", surname: "X" }),
    /400/,
  );
});

test("el conector simulado devuelve 404 al ligar una vacante a un postulante inexistente", async () => {
  const client = new BukClientMock();
  await assert.rejects(
    () =>
      client.createApplication({
        applicant_id: "999999",
        selection_process_id: VACANTE_A,
      }),
    /404/,
  );
});

test("listarPostulados muestra al candidato sembrado en su vacante", () => {
  const client = new BukClientMock();
  const postulados = client.listarPostulados(VACANTE_A);
  assert.equal(postulados.length, 1);
  assert.equal(postulados[0].nombre, "Carlos Mendoza Ruiz");
  assert.equal(postulados[0].vacante_referencia, "DEV-BE-2026");
  assert.equal(postulados[0].etapa, "Postulantes");
});

test("tras crear postulación, aparece en el apartado Postulados", async () => {
  const client = new BukClientMock();

  const creado = await client.createApplicant({
    first_name: "María",
    surname: "García",
    email: "maria@example.com",
  });
  await client.createApplication({
    applicant_id: String(creado.id),
    selection_process_id: VACANTE_A,
    process_stage_id: "Postulantes",
    application_date: "2026-10-16",
    referrer: "external",
    custom_attributes: { vacancy_title: "Backend", vacancy_reference: "DEV-BE-2026" },
  });

  const postulados = client.listarPostulados(VACANTE_A);
  assert.equal(postulados.length, 2);
  assert.equal(postulados[0].nombre, "María García", "lo más reciente va arriba");
  assert.equal(postulados[0].origen, "external");
});

test("un fallo forzado se consume solo una vez", async () => {
  const client = new BukClientMock();
  BukClientMock.forzarError(500);

  await assert.rejects(
    () => client.createApplicant({ first_name: "Ana", surname: "T" }),
    /500/,
  );

  // La siguiente llamada ya no falla
  const ok = await client.createApplicant({ first_name: "Ana", surname: "Torres" });
  assert.ok(ok.id);
});
