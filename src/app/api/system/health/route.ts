import { NextResponse } from "next/server";

/** Unauthenticated liveness probe - only confirms the process is up and serving requests. */
export async function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
