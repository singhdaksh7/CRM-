import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { notificationVisibilityWhere } from "@/lib/notifications";
import { getOrganizationId } from "@/lib/organization";
import { NotificationList } from "@/components/notifications/notification-list";
import { NOTIFICATION_LABELS } from "@/components/notifications/notification-meta";
import { cn } from "@/lib/utils";
import type { NotificationType, Prisma } from "@prisma/client";

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await auth();
  const sp = await searchParams;
  const typeFilter = sp.type as NotificationType | undefined;
  const unreadOnly = sp.unread === "true";

  const where: Prisma.NotificationWhereInput = {
    organizationId: getOrganizationId(session!.user.id),
    ...notificationVisibilityWhere(session!.user.id, session!.user.role),
    ...(typeFilter ? { type: typeFilter } : {}),
    ...(unreadOnly ? { isRead: false } : {}),
  };

  const notifications = await prisma.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 200 });
  const types = Object.keys(NOTIFICATION_LABELS) as NotificationType[];

  return (
    <div className="space-y-6">
      <div className="border-b border-[rgba(255,255,255,0.08)] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#F8FAFC]">Notifications Centre</h1>
        <p className="mt-1 text-sm text-[#94A3B8]">Alerts & operational updates across leads, site visits, and follow-ups.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip href="/notifications" active={!typeFilter && !unreadOnly} label="All" />
        <FilterChip href="/notifications?unread=true" active={unreadOnly} label="Unread" />
        {types.map((t) => (
          <FilterChip key={t} href={`/notifications?type=${t}`} active={typeFilter === t} label={NOTIFICATION_LABELS[t]} />
        ))}
      </div>

      <div className="rounded-xl border border-[rgba(255,255,255,0.08)] bg-[#181E2A] p-2 shadow-sm">
        <NotificationList notifications={notifications} />
      </div>
    </div>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-full px-3 py-1.5 text-xs font-semibold transition-all border",
        active
          ? "bg-[#4F8CFF] text-white border-[#4F8CFF] shadow-sm"
          : "bg-[#181E2A] text-[#CBD5E1] border-[rgba(255,255,255,0.08)] hover:bg-[#1E2533] hover:text-white"
      )}
    >
      {label}
    </Link>
  );
}
