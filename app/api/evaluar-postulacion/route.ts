import { NextResponse } from "next/server";
import { evaluateScreening } from "@/lib/screening/evaluator";
import { screeningInputSchema } from "@/lib/screening/schema";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "El cuerpo debe ser JSON válido." }, { status: 400 });
  }

  const source = body && typeof body === "object" && "screening" in body
    ? (body as { screening: unknown }).screening
    : body;
  const parsed = screeningInputSchema.safeParse(source);
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      error: "La configuración de preselección no es válida.",
      campos_con_error: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
    }, { status: 400 });
  }

  return NextResponse.json({ ok: true, evaluacion: evaluateScreening(parsed.data) });
}
