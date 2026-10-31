import type { ScreeningInput, ScreeningQuestion } from "./schema";

export type ScreeningStatus = "Cumple" | "Revisar" | "No cumple" | "Descartado";

export type ScreeningEvaluation = {
  porcentaje: number;
  cumple: number;
  total: number;
  descartado: boolean;
  estado: ScreeningStatus;
  detalle: Array<{
    id: string;
    texto: string;
    tipo: ScreeningQuestion["tipo"];
    obligatoria: boolean;
    cumple: boolean;
    respuesta: string | number | boolean | null;
    respuestaTexto: string;
    criterio: string;
  }>;
};

function parseBoolean(value: unknown): boolean | null {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  const normalized = String(value ?? "").trim().toLowerCase();
  if (["true", "1", "si", "sí", "s"].includes(normalized)) return true;
  if (["false", "0", "no", "n"].includes(normalized)) return false;
  return null;
}

function passed(question: ScreeningQuestion, answer: unknown): boolean {
  if (answer === undefined || answer === null || String(answer).trim() === "") return false;

  switch (question.tipo) {
    case "sino": {
      const value = parseBoolean(answer);
      return value !== null && value === question.respuestaAprobatoria;
    }
    case "numero": {
      const value = Number(String(answer).replace(",", "."));
      return Number.isFinite(value) && value >= question.minimo;
    }
    case "lista":
      return question.opcionesAprobatorias.includes(String(answer).trim());
  }
}

function describeCriterion(question: ScreeningQuestion): string {
  switch (question.tipo) {
    case "sino":
      return `Respuesta esperada: ${question.respuestaAprobatoria ? "Sí" : "No"}`;
    case "numero":
      return `Valor mínimo: ${question.minimo}`;
    case "lista":
      return `Opciones válidas: ${question.opcionesAprobatorias.length ? question.opcionesAprobatorias.join(", ") : "ninguna"}`;
  }
}

export function evaluateScreening(input: ScreeningInput): ScreeningEvaluation {
  let passedCount = 0;
  let mandatoryFailure = false;

  const detail = input.preguntas.map((question) => {
    const answer = input.respuestas[question.id] ?? "";
    const isPassed = passed(question, answer);
    if (isPassed) passedCount++;
    else if (question.obligatoria) mandatoryFailure = true;

    const responseText = question.tipo === "sino"
      ? parseBoolean(answer) === true
        ? "Sí"
        : parseBoolean(answer) === false
          ? "No"
          : String(answer || "Sin respuesta")
      : answer === "" || answer === null
        ? "Sin respuesta"
        : String(answer).trim();

    return {
      id: question.id,
      texto: question.texto,
      tipo: question.tipo,
      obligatoria: question.obligatoria,
      cumple: isPassed,
      respuesta: answer,
      respuestaTexto: responseText,
      criterio: describeCriterion(question),
    };
  });

  const total = input.preguntas.length;
  const porcentaje = Math.round((passedCount / total) * 100);
  const estado: ScreeningStatus = mandatoryFailure
    ? "Descartado"
    : porcentaje >= 80
      ? "Cumple"
      : porcentaje >= 60
        ? "Revisar"
        : "No cumple";

  return {
    porcentaje,
    cumple: passedCount,
    total,
    descartado: mandatoryFailure,
    estado,
    detalle: detail,
  };
}
