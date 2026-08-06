import { ReportsTabs } from "@/components/dashboard/reports-tabs";
import { ReportBuilderForm } from "@/components/dashboard/report-builder-form";

export default function ReportBuilderPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-[#1B2430]">Custom Report Builder</h1>
        <p className="text-sm text-[#596579]">Generate and export lead, visit, employee, brokerage, or property reports for any date range</p>
      </div>

      <ReportsTabs />

      <ReportBuilderForm />
    </div>
  );
}
