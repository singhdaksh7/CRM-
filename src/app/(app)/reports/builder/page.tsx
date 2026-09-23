import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { ReportBuilderForm } from "@/components/dashboard/report-builder-form";

export default function ReportBuilderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#09090B]">Custom Report Builder</h1>
        <p className="mt-1 text-sm text-[#52525B]">Generate and export lead, visit, employee, brokerage, or property reports for any date range</p>
      </div>

      <ReportsTabs />

      <ReportBuilderForm />
    </div>
  );
}
