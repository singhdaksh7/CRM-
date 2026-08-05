import { NextRequest, NextResponse } from "next/server";
import { requireSession, handleApiError } from "@/lib/api-auth";
import { getDealSuggestions } from "@/lib/rules";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireSession();
    const { id } = await params;
    const suggestions = await getDealSuggestions(id);
    return NextResponse.json({ suggestions });
  } catch (err) {
    return handleApiError(err);
  }
}
