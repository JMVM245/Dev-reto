import { z } from "zod";

const questionBase = z.object({
  id: z.string().min(1),
  texto: z.string().min(1),
  obligatoria: z.boolean().default(false),
});

export const screeningQuestionSchema = z.discriminatedUnion("tipo", [
  questionBase.extend({
    tipo: z.literal("sino"),
    respuestaAprobatoria: z.boolean(),
  }),
  questionBase.extend({
    tipo: z.literal("numero"),
    minimo: z.number().finite().default(0),
  }),
  questionBase.extend({
    tipo: z.literal("lista"),
    opcionesAprobatorias: z.array(z.string().trim().min(1)),
  }),
]);

export const screeningInputSchema = z.object({
  preguntas: z.array(screeningQuestionSchema).min(1).max(100),
  respuestas: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ).default({}),
});

export type ScreeningQuestion = z.infer<typeof screeningQuestionSchema>;
export type ScreeningInput = z.infer<typeof screeningInputSchema>;
