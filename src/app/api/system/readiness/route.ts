import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/system-status";

/** Unauthenticated readiness probe for orchestrators/load balancers - returns 503 until DB + env are healthy. */
export async function GET() {
  const readiness = await getReadiness();
  return NextResponse.json(readiness, { status: readiness.ready ? 200 : 503 });
}
