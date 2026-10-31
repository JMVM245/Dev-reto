import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ filename: string }> }) {
  const { filename } = await context.params;
  if (!/^cv-[0-9a-f-]{36}\.pdf$/i.test(filename)) {
    return new Response("No encontrado", { status: 404 });
  }

  try {
    const file = await readFile(join(process.cwd(), "data", "cv", filename));
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": 'inline; filename="hoja-de-vida.pdf"',
        "Cache-Control": "private, max-age=0, must-revalidate",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("No encontrado", { status: 404 });
  }
}
