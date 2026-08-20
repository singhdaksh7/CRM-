import { describe, it, expect, vi, beforeEach } from "vitest";

const automationRuleFindMany = vi.fn();
const automationRuleFindUniqueOrThrow = vi.fn();
const automationRuleCreate = vi.fn();
const leadFindUnique = vi.fn();
const leadUpdate = vi.fn();
const leadFindMany = vi.fn();
const visitFindUnique = vi.fn();
const visitFindMany = vi.fn();
const followUpFindFirst = vi.fn();
const followUpCreate = vi.fn();
const dealFindUnique = vi.fn();
const dealUpdate = vi.fn();
const notificationFindFirst = vi.fn();
const notificationCreate = vi.fn();
const catalogueShareFindMany = vi.fn();
const paymentFindMany = vi.fn();
const auditLogCreate = vi.fn();

vi.mock("./prisma", () => ({
  prisma: {
    automationRule: {
      findMany: (...a: unknown[]) => automationRuleFindMany(...a),
      findUniqueOrThrow: (...a: unknown[]) => automationRuleFindUniqueOrThrow(...a),
      create: (...a: unknown[]) => automationRuleCreate(...a),
      update: vi.fn(),
      delete: vi.fn(),
    },
    lead: {
      findUnique: (...a: unknown[]) => leadFindUnique(...a),
      update: (...a: unknown[]) => leadUpdate(...a),
      findMany: (...a: unknown[]) => leadFindMany(...a),
    },
    visit: {
      findUnique: (...a: unknown[]) => visitFindUnique(...a),
      findMany: (...a: unknown[]) => visitFindMany(...a),
    },
    followUp: {
      findFirst: (...a: unknown[]) => followUpFindFirst(...a),
      create: (...a: unknown[]) => followUpCreate(...a),
    },
    deal: {
      findUnique: (...a: unknown[]) => dealFindUnique(...a),
      update: (...a: unknown[]) => dealUpdate(...a),
    },
    notification: {
      findFirst: (...a: unknown[]) => notificationFindFirst(...a),
      create: (...a: unknown[]) => notificationCreate(...a),
    },
    catalogueShare: { findMany: (...a: unknown[]) => catalogueShareFindMany(...a) },
    payment: { findMany: (...a: unknown[]) => paymentFindMany(...a) },
    activity: { create: vi.fn().mockResolvedValue({}) },
    auditLog: { create: (...a: unknown[]) => auditLogCreate(...a) },
  },
}));

const logActivity = vi.fn().mockResolvedValue({});
vi.mock("./activity", () => ({ logActivity: (...a: unknown[]) => logActivity(...a) }));

vi.mock("./notifications", () => ({
  createNotification: (...a: unknown[]) => notificationCreate(...a),
}));

import {
  runAutomationRules,
  previewAutomationRule,
  createAutomationRule,
  isDemoRecordId,
  type AutomationContext,
} from "./automation-rules";

beforeEach(() => {
  vi.clearAllMocks();
  auditLogCreate.mockResolvedValue({});
});

describe("createAutomationRule", () => {
  it("always creates a rule disabled, regardless of what the caller passes as isActive", async () => {
    automationRuleCreate.mockResolvedValue({ id: "r1", isActive: false });
    await createAutomationRule({ name: "Test", trigger: "LEAD_CREATED", actionType: "ASSIGN_EMPLOYEE", isActive: true, createdById: "u1", organizationId: "org_default" });
    expect(automationRuleCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ isActive: false }) }));
  });
});

describe("isDemoRecordId", () => {
  it("recognizes the demo id prefix", () => {
    expect(isDemoRecordId("kp-demo-lead-1")).toBe(true);
    expect(isDemoRecordId("KP-DEMO-lead-1")).toBe(true);
    expect(isDemoRecordId("clreal1234")).toBe(false);
  });
});

describe("runAutomationRules - ASSIGN_EMPLOYEE (LEAD_CREATED)", () => {
  const rule = { id: "rule1", actionType: "ASSIGN_EMPLOYEE", actionConfig: JSON.stringify({ employeeId: "emp1" }) };
  const context: AutomationContext = { trigger: "LEAD_CREATED", leadId: "lead1", organizationId: "org_default" };

  it("assigns the lead when it is currently unassigned", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    leadFindUnique.mockResolvedValue({ assignedToId: null });
    await runAutomationRules(context);
    expect(leadUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "lead1" }, data: expect.objectContaining({ assignedToId: "emp1" }) }));
  });

  it("never overrides an existing assignment (idempotent)", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    leadFindUnique.mockResolvedValue({ assignedToId: "someoneElse" });
    await runAutomationRules(context);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("skips demo-seeded leads by default", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    const demoContext: AutomationContext = { trigger: "LEAD_CREATED", leadId: "kp-demo-lead-1", organizationId: "org_default" };
    await runAutomationRules(demoContext);
    expect(leadFindUnique).not.toHaveBeenCalled();
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("does nothing when no active rules exist for this trigger", async () => {
    automationRuleFindMany.mockResolvedValue([]);
    await runAutomationRules(context);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("requests at most a bounded number of rules per trigger", async () => {
    automationRuleFindMany.mockResolvedValue([]);
    await runAutomationRules(context);
    const callArgs = automationRuleFindMany.mock.calls[0][0];
    expect(callArgs.take).toBeGreaterThan(0);
    expect(callArgs.take).toBeLessThanOrEqual(50);
  });

  it("isolates a failing rule - one throwing rule does not stop other rules or throw out of runAutomationRules", async () => {
    const brokenRule = { id: "broken", actionType: "ASSIGN_EMPLOYEE", actionConfig: "not valid json{" };
    automationRuleFindMany.mockResolvedValue([brokenRule, rule]);
    leadFindUnique.mockResolvedValue({ assignedToId: null });
    await expect(runAutomationRules(context)).resolves.toBeUndefined();
    expect(leadUpdate).toHaveBeenCalled(); // the second, valid rule still ran
  });
});

describe("runAutomationRules - CREATE_FOLLOW_UP (VISIT_COMPLETED) - dedup", () => {
  const rule = { id: "rule2", actionType: "CREATE_FOLLOW_UP", actionConfig: JSON.stringify({}) };
  const context: AutomationContext = { trigger: "VISIT_COMPLETED", visitId: "visit1", leadId: "lead1", organizationId: "org_default" };

  it("creates a follow-up when none was recently auto-created for this lead", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    visitFindUnique.mockResolvedValue({ id: "visit1", assignedToId: "emp1" });
    followUpFindFirst.mockResolvedValue(null);
    await runAutomationRules(context);
    expect(followUpCreate).toHaveBeenCalled();
  });

  it("does NOT create a duplicate follow-up when one was already auto-created for this lead within the dedup window", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    visitFindUnique.mockResolvedValue({ id: "visit1", assignedToId: "emp1" });
    followUpFindFirst.mockResolvedValue({ id: "existingFollowUp" });
    await runAutomationRules(context);
    expect(followUpCreate).not.toHaveBeenCalled();
  });
});

describe("runAutomationRules - NOTIFY_EMPLOYEE (CATALOGUE_OPENED) - dedup", () => {
  const rule = { id: "rule3", actionType: "NOTIFY_EMPLOYEE", actionConfig: JSON.stringify({}) };
  const context: AutomationContext = { trigger: "CATALOGUE_OPENED", catalogueShareId: "cat1", leadId: "lead1", organizationId: "org_default" };

  it("notifies the assigned employee when no recent notification exists", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    leadFindUnique.mockResolvedValue({ assignedToId: "emp1" });
    notificationFindFirst.mockResolvedValue(null);
    await runAutomationRules(context);
    expect(notificationCreate).toHaveBeenCalled();
  });

  it("does NOT send a duplicate notification within the dedup window", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    leadFindUnique.mockResolvedValue({ assignedToId: "emp1" });
    notificationFindFirst.mockResolvedValue({ id: "existingNotification" });
    await runAutomationRules(context);
    expect(notificationCreate).not.toHaveBeenCalled();
  });
});

describe("runAutomationRules - MARK_DEAL_CLOSED (PAYMENT_RECEIVED)", () => {
  const rule = { id: "rule4", actionType: "MARK_DEAL_CLOSED", actionConfig: JSON.stringify({}) };
  const context: AutomationContext = { trigger: "PAYMENT_RECEIVED", paymentId: "pay1", dealId: "deal1", organizationId: "org_default" };

  it("closes an OPEN deal", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    dealFindUnique.mockResolvedValue({ status: "OPEN", leadId: "lead1" });
    await runAutomationRules(context);
    expect(dealUpdate).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "deal1" }, data: expect.objectContaining({ status: "WON" }) }));
  });

  it("does not re-close an already-closed deal (idempotent)", async () => {
    automationRuleFindMany.mockResolvedValue([rule]);
    dealFindUnique.mockResolvedValue({ status: "WON", leadId: "lead1" });
    await runAutomationRules(context);
    expect(dealUpdate).not.toHaveBeenCalled();
  });
});

describe("previewAutomationRule - zero-write guarantee", () => {
  it("never calls any write method (update/create/delete) while previewing, even when every sampled record would fire", async () => {
    automationRuleFindUniqueOrThrow.mockResolvedValue({
      id: "rule1", organizationId: "org_default", trigger: "LEAD_CREATED", actionType: "ASSIGN_EMPLOYEE", actionConfig: JSON.stringify({ employeeId: "emp1" }),
    });
    leadFindMany.mockResolvedValue([{ id: "lead1", leadCode: "LEAD-0001", clientName: "A" }, { id: "lead2", leadCode: "LEAD-0002", clientName: "B" }]);
    leadFindUnique.mockResolvedValue({ assignedToId: null }); // every record would be eligible

    const result = await previewAutomationRule("rule1");

    expect(result.matchedCount).toBe(2);
    expect(result.skippedCount).toBe(0);
    expect(leadUpdate).not.toHaveBeenCalled();
    expect(notificationCreate).not.toHaveBeenCalled();
    expect(followUpCreate).not.toHaveBeenCalled();
    expect(dealUpdate).not.toHaveBeenCalled();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it("reports skipped records with a reason, without writing", async () => {
    automationRuleFindUniqueOrThrow.mockResolvedValue({
      id: "rule1", organizationId: "org_default", trigger: "LEAD_CREATED", actionType: "ASSIGN_EMPLOYEE", actionConfig: JSON.stringify({ employeeId: "emp1" }),
    });
    leadFindMany.mockResolvedValue([{ id: "lead1", leadCode: "LEAD-0001", clientName: "A" }]);
    leadFindUnique.mockResolvedValue({ assignedToId: "alreadyAssigned" });

    const result = await previewAutomationRule("rule1");

    expect(result.matchedCount).toBe(0);
    expect(result.skippedCount).toBe(1);
    expect(result.rows[0].reason).toMatch(/already assigned/i);
    expect(leadUpdate).not.toHaveBeenCalled();
  });

  it("returns an empty, zero-write preview when there are no matching-trigger records to sample", async () => {
    automationRuleFindUniqueOrThrow.mockResolvedValue({
      id: "rule1", organizationId: "org_default", trigger: "LEAD_CREATED", actionType: "ASSIGN_EMPLOYEE", actionConfig: JSON.stringify({ employeeId: "emp1" }),
    });
    leadFindMany.mockResolvedValue([]);
    const result = await previewAutomationRule("rule1");
    expect(result.sampleSize).toBe(0);
    expect(leadFindUnique).not.toHaveBeenCalled();
  });
});
