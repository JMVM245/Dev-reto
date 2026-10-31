import { test } from "node:test";
import assert from "node:assert/strict";
import { ESCENARIOS, buscarEscenario } from "../lib/test/escenarios.ts";
import { postulationSchema } from "../lib/validation/schema.ts";

test("hay escenarios para los casos que hay que demostrar", () => {
  const claves = ESCENARIOS.map((e) => e.clave);
  for (const requerida of ["nueva", "duplicado", "otra_vacante", "invalido", "fallo_buk"]) {
    assert.ok(claves.includes(requerida), `falta el escenario "${requerida}"`);
  }
});

test("cada escenario describe qué se espera que pase", () => {
  for (const e of ESCENARIOS) {
    assert.ok(e.titulo.length > 0, `escenario ${e.clave} sin titulo`);
    assert.ok(e.descripcion.length > 0, `escenario ${e.clave} sin descripcion`);
    assert.ok(e.esperado.length > 0, `escenario ${e.clave} sin esperado`);
  }
});

test("los escenarios válidos producen un payload que pasa la validación", () => {
  for (const e of ESCENARIOS) {
    if (e.clave === "invalido") continue; // ese está diseñado para fallar
    const r = postulationSchema.safeParse(e.construir());
    assert.equal(r.success, true, `el escenario ${e.clave} produce un payload inválido`);
  }
});

test("el escenario invalido efectivamente falla la validación", () => {
  const esc = buscarEscenario("invalido");
  assert.ok(esc);
  const r = postulationSchema.safeParse(esc.construir());
  assert.equal(r.success, false);
});

test("el escenario de duplicado apunta al candidato sembrado y a su vacante", () => {
  const esc = buscarEscenario("duplicado");
  assert.ok(esc);
  const p = esc.construir();
  assert.equal(p.candidate.email.toLowerCase(), "carlos.mendoza@example.com");
  assert.equal(p.job.reference, "DEV-BE-2026");
});

test("el escenario de otra vacante usa una vacante distinta a la del duplicado", () => {
  const dup = buscarEscenario("duplicado");
  const otra = buscarEscenario("otra_vacante");
  assert.ok(dup && otra);
  assert.notEqual(dup.construir().job.reference, otra.construir().job.reference);
  // Pero el mismo candidato — para demostrar que NO es duplicado
  assert.equal(
    dup.construir().candidate.email.toLowerCase(),
    otra.construir().candidate.email.toLowerCase(),
  );
});

test("el escenario de fallo de BUK fuerza un 5xx", () => {
  const esc = buscarEscenario("fallo_buk");
  assert.ok(esc);
  assert.ok((esc.forzarErrorBuk ?? 0) >= 500);
});

test("buscarEscenario devuelve undefined para una clave desconocida", () => {
  assert.equal(buscarEscenario("no-existe"), undefined);
});

test("cada external_id es único — no deben chocar entre escenarios", () => {
  const ids = ESCENARIOS.map((e) => e.construir().external_id);
  assert.equal(new Set(ids).size, ids.length);
});
