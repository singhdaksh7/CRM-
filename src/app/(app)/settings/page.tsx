import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { ROLE_LABELS } from "@/lib/permissions";
import { Badge } from "@/components/ui/badge";
import { Building, MessageCircle, Sparkles, Users, Database, Workflow, Map, Settings2, Zap } from "lucide-react";
import { AssignmentRulesPanel } from "@/components/settings/assignment-rules-panel";
import { WhatsAppDiagnosticsPanel } from "@/components/settings/whatsapp-diagnostics-panel";
import { MapsDiagnosticsPanel } from "@/components/settings/maps-diagnostics-panel";
import { SystemConfigPanel } from "@/components/settings/system-config-panel";
import { AutomationRulesPanel } from "@/components/settings/automation-rules-panel";
import { getWhatsAppConfigStatus } from "@/integrations/whatsapp/whatsapp-config";
import { listWhatsAppTemplates } from "@/integrations/whatsapp/whatsapp-templates";
import { getMapsCapabilitiesDTO } from "@/lib/maps-capabilities";

export default async function SettingsPage() {
  const [propertyCount, leadCount, userCount, session] = await Promise.all([
    prisma.property.count(),
    prisma.lead.count(),
    prisma.user.count(),
    auth(),
  ]);
  const whatsapp = getWhatsAppConfigStatus();
  const templates = listWhatsAppTemplates();
  const maps = getMapsCapabilitiesDTO();
  const isAdmin = session?.user?.role === "ADMIN";

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="border-b border-[#E7ECF2] pb-4">
        <h1 className="text-2xl font-bold tracking-tight text-[#1B2430]">System & Integration Settings</h1>
        <p className="mt-1 text-sm text-[#596579]">Organization profile, WhatsApp credentials, matching logic & lead rules</p>
      </div>

      <SettingsSection icon={Building} title="Company Profile">
        <Row label="Brokerage Name" value="Delhi Broker CRM" />
        <Row label="City / Region" value="Delhi-NCR, India" />
        <Row label="Currency Format" value="Indian Rupee (₹) with Lakh/Crore notation" />
      </SettingsSection>

      <SettingsSection icon={MessageCircle} title="WhatsApp Integration Engine">
        <Row
          label="Active Provider"
          value={
            <Badge tone={whatsapp.provider === "META_CLOUD" ? (whatsapp.metaReady ? "green" : "red") : "whatsapp"}>
              {whatsapp.provider === "MOCK" ? "Mock (Demo Provider)" : whatsapp.provider === "CLICK_TO_CHAT" ? "Click-to-Chat Direct" : whatsapp.metaReady ? "Meta Cloud API (Configured)" : "Meta Cloud API (Incomplete)"}
            </Badge>
          }
        />
        <ConfigRow label="Phone Number ID" status={whatsapp.phoneNumberId} />
        <ConfigRow label="Business Account ID" status={whatsapp.businessAccountId} />
        <ConfigRow label="Access Token" status={whatsapp.accessToken} />
        <ConfigRow label="Verify Token" status={whatsapp.verifyToken} />
        <ConfigRow label="App Secret" status={whatsapp.appSecret} />
        <Row label="API Version" value={whatsapp.apiVersion} />
        <Row label="Default Country Code" value={`+${whatsapp.defaultCountryCode}`} />
        <Row
          label="Webhook"
          value={
            whatsapp.provider !== "META_CLOUD" ? (
              <Badge tone="slate">Not applicable</Badge>
            ) : whatsapp.webhookEnabled ? (
              <Badge tone="green">Enabled (not independently verified)</Badge>
            ) : (
              <Badge tone="red">Disabled</Badge>
            )
          }
        />
        <div>
          <p className="mb-1.5 text-xs font-semibold text-[#8A94A6]">Templates</p>
          <div className="flex flex-wrap gap-1.5">
            {templates.map((t) => (
              <Badge key={t.useCase} tone={t.approved ? "green" : "slate"}>
                {t.name} {t.approved ? "· Approved" : "· Not confirmed"}
              </Badge>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#8A94A6] border-t border-[#EFF4FF] pt-2.5">
          🔒 Secrets are securely validated server-side and never exposed to the client browser.
        </p>
        {isAdmin && <WhatsAppDiagnosticsPanel />}
      </SettingsSection>

      <SettingsSection icon={Map} title="Maps & Localities">
        <Row label="Provider" value={<Badge tone={maps.configured ? "green" : "slate"}>{maps.configured ? "Google Maps (Configured)" : "Not configured"}</Badge>} />
        <ConfigRow label="Server Key" status={maps.configured ? "configured" : "missing"} />
        <ConfigRow label="Browser Key" status={maps.browserKeyConfigured ? "configured" : "missing"} />
        <Row label="Default Region" value={maps.defaultRegion} />
        <Row label="Default Language" value={maps.defaultLanguage} />
        <Row label="Default City" value={maps.defaultCity} />
        {!maps.configured && (
          <p className="rounded-xl border border-dashed border-[#FCE8E6] bg-[#FFF8F7] p-3 text-xs text-[#8A94A6]">
            Maps integration is not configured. Address search and map previews are unavailable, but manual address entry, property forms, and external &quot;Open in Google Maps&quot; links continue to work with zero configuration.
          </p>
        )}
        <p className="text-xs text-[#8A94A6] border-t border-[#EFF4FF] pt-2.5">
          🔒 Keys are securely validated server-side and never exposed beyond what this page shows.
        </p>
        {isAdmin && <MapsDiagnosticsPanel />}
      </SettingsSection>

      <SettingsSection icon={Sparkles} title="Property Matching Engine">
        <Row label="Default Budget Tolerance" value="Up to 20% above requested maximum" />
        <Row label="Match Score Weights" value="Location 25% · Budget 30% · BHK 20% · Furnishing 10% · Availability 8% · Type 7%" />
      </SettingsSection>

      <SettingsSection icon={Workflow} title="Automatic Lead Assignment Rules">
        <p className="mb-4 text-xs text-[#8A94A6]">
          Rules run in priority order against every new lead (manual entry or portal webhook). The first active rule matching source or location decides assignment.
        </p>
        <AssignmentRulesPanel />
      </SettingsSection>

      {isAdmin && (
        <SettingsSection icon={Settings2} title="System Configuration">
          <p className="mb-4 text-xs text-[#8A94A6]">
            Business rules previously hardcoded in the app - hot lead threshold, health score weights, matching radius/budget tolerance, follow-up SLA, visit reminders, notification throttling, catalogue expiry, and business hours.
          </p>
          <SystemConfigPanel />
        </SettingsSection>
      )}

      {isAdmin && (
        <SettingsSection icon={Zap} title="Automation Rules Engine">
          <p className="mb-4 text-xs text-[#8A94A6]">
            When X happens, do Y. Rules run best-effort right after the triggering event and never block it - a failing rule is logged, not surfaced as an error.
          </p>
          <AutomationRulesPanel />
        </SettingsSection>
      )}

      <SettingsSection icon={Users} title="Team & Roles">
        <Row label="Admin" value={ROLE_LABELS.ADMIN + " — full system & settings access"} />
        <Row label="Data Manager" value={ROLE_LABELS.DATA_MANAGER + " — properties, leads, matching, sharing, follow-ups, visits"} />
        <Row label="Field Executive" value={ROLE_LABELS.FIELD_EXECUTIVE + " — assigned leads, visits, follow-ups"} />
      </SettingsSection>

      <SettingsSection icon={Database} title="Data Overview">
        <Row label="Active Properties" value={propertyCount} />
        <Row label="Total Leads" value={leadCount} />
        <Row label="Team Members" value={userCount} />
        <Row label="Database Engine" value="SQLite (dev) — migration-ready for PostgreSQL" />
      </SettingsSection>
    </div>
  );
}

function SettingsSection({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#E7ECF2] bg-white p-5 shadow-xs space-y-3">
      <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-[#1B2430]">
        <Icon className="h-4 w-4 text-[#3366FF]" /> {title}
      </h3>
      <div className="space-y-3.5 border-t border-[#EFF4FF] pt-3">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span className="text-[#8A94A6]">{label}</span>
      <span className="font-semibold text-[#1B2430]">{value}</span>
    </div>
  );
}

function ConfigRow({ label, status }: { label: string; status: "configured" | "missing" }) {
  return <Row label={label} value={<Badge tone={status === "configured" ? "green" : "slate"}>{status === "configured" ? "Configured" : "Missing"}</Badge>} />;
}
