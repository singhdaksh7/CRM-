import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireSession, handleApiError, ApiError } from "@/lib/api-auth";
import { getOrganizationId } from "@/lib/organization";
import { dealOfferSchema } from "@/lib/validators";
import { recordDealActivity } from "@/lib/deals";
import { recordAudit } from "@/lib/audit";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const s = await requireSession(); const { id } = await params; const deal = await prisma.deal.findFirst({ where: { id, organizationId: getOrganizationId(s.user) } }); if (!deal) throw new ApiError(404, "Deal not found"); return NextResponse.json({ offers: await prisma.dealOffer.findMany({ where: { dealId: id }, include: { createdBy: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } }) }); } catch (e) { return handleApiError(e); } }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const s = await requireSession(["ADMIN", "DATA_MANAGER"]); const { id } = await params; const organizationId = getOrganizationId(s.user); const data = dealOfferSchema.parse(await req.json()); const deal = await prisma.deal.findFirst({ where: { id, organizationId, status: "OPEN" } }); if (!deal) throw new ApiError(404, "Open deal not found"); const offer = await prisma.dealOffer.create({ data: { ...data, dealId: id, organizationId, createdById: s.user.id } }); await recordDealActivity({ dealId: id, type: "DEAL_STAGE_CHANGED", description: `${data.side} offer added: ₹${data.amount.toLocaleString("en-IN")}`, actorId: s.user.id, metadata: { offerId: offer.id } }); await recordAudit({ userId: s.user.id, action: "CREATE", entityType: "DealOffer", entityId: offer.id, newValues: data }); return NextResponse.json({ offer }, { status: 201 }); } catch (e) { return handleApiError(e); } }
