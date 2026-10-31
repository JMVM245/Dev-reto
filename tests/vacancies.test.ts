import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { resolverVacante, vacantesConfiguradas } from "../lib/config/vacancies.ts";

const ORIGINAL = { ...process.env };

beforeEach(() => {
  delete process.env.BUK_VACANCY_MAP;
  delete process.env.BUK_SELECTION_PROCESS_ID;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

test("sin ninguna configuración devuelve un error explicativo", () => {
  const r = resolverVacante("DEV-BE-2026");
  assert.equal(r.ok, false);
  if (!r.ok) assert.match(r.error, /BUK_VACANCY_MAP/);
});

test("encuentra la vacante en el mapa por referencia", () => {
  process.env.BUK_VACANCY_MAP = '{"DEV-BE-2026": 123, "DA-2026": 456}';
  const r = resolverVacante("DEV-BE-2026");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.selectionProcessId, 123);
    assert.equal(r.origen, "mapa");
  }
});

test("la comparación de referencia ignora mayúsculas y espacios", () => {
  process.env.BUK_VACANCY_MAP = '{"DEV-BE-2026": 123}';
  const r = resolverVacante("  dev-be-2026  ");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.selectionProcessId, 123);
});

test("referencia no mapeada cae al valor por defecto", () => {
  process.env.BUK_VACANCY_MAP = '{"DEV-BE-2026": 123}';
  process.env.BUK_SELECTION_PROCESS_ID = "999";
  const r = resolverVacante("QA-2026");
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.selectionProcessId, 999);
    assert.equal(r.origen, "por_defecto");
  }
});

test("un mapa malformado no tumba la petición — usa el por defecto", () => {
  process.env.BUK_VACANCY_MAP = "esto no es json {";
  process.env.BUK_SELECTION_PROCESS_ID = "555";
  const r = resolverVacante("DEV-BE-2026");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.selectionProcessId, 555);
});

test("un mapa malformado sin por defecto devuelve error, no excepción", () => {
  process.env.BUK_VACANCY_MAP = "[1,2,3]";
  const r = resolverVacante("DEV-BE-2026");
  assert.equal(r.ok, false);
});

test("vacantesConfiguradas expone el mapa para la consola", () => {
  process.env.BUK_VACANCY_MAP = '{"DEV-BE-2026": 123, "DA-2026": 456}';
  assert.deepEqual(vacantesConfiguradas(), {
    "DEV-BE-2026": 123,
    "DA-2026": 456,
  });
});

test("sin mapa configurado devuelve un objeto vacío", () => {
  assert.deepEqual(vacantesConfiguradas(), {});
});
