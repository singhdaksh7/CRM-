-- CreateIndex
CREATE INDEX "deals_assignedToId_idx" ON "deals"("assignedToId");

-- CreateIndex
CREATE INDEX "deals_leadId_idx" ON "deals"("leadId");

-- CreateIndex
CREATE INDEX "deals_ownerId_idx" ON "deals"("ownerId");

-- CreateIndex
CREATE INDEX "deals_propertyId_idx" ON "deals"("propertyId");

-- CreateIndex
CREATE INDEX "leads_organizationId_phone_idx" ON "leads"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "leads_organizationId_assignedToId_idx" ON "leads"("organizationId", "assignedToId");

-- CreateIndex
CREATE INDEX "owners_organizationId_phone_idx" ON "owners"("organizationId", "phone");

-- CreateIndex
CREATE INDEX "properties_ownerId_idx" ON "properties"("ownerId");

-- CreateIndex
CREATE INDEX "properties_organizationId_status_idx" ON "properties"("organizationId", "status");
