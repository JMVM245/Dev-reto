import { NextResponse } from "next/server";
import { jobs } from "@/lib/config/jobs";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    modo: process.env.BUK_MODE?.trim().toLowerCase() === "real" ? "real" : "mock",
    vacantes: jobs
      .filter((job) => job.status === "active")
      .map(({ reference, title, company, location }) => ({ reference, title, company, location })),
  });
}
