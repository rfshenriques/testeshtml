-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'running', 'paused', 'complete', 'halted');

-- CreateEnum
CREATE TYPE "TileStatus" AS ENUM ('pending', 'searching', 'saturated', 'done', 'failed');

-- CreateEnum
CREATE TYPE "WebsiteStatus" AS ENUM ('none', 'social_only', 'parked', 'broken', 'http_only', 'live', 'unknown');

-- CreateEnum
CREATE TYPE "LeadStage" AS ENUM ('discovered', 'qualified', 'enriched', 'profiled', 'generated', 'quoted', 'contacted', 'replied', 'won', 'lost', 'manual_review', 'suppressed');

-- CreateEnum
CREATE TYPE "LegalGate" AS ENUM ('pending', 'clear', 'blocked');

-- CreateEnum
CREATE TYPE "FallbackChannel" AS ENUM ('email', 'phone_outreach', 'postal_outreach');

-- CreateEnum
CREATE TYPE "EmailType" AS ENUM ('named', 'role_generic', 'catchall_guess');

-- CreateEnum
CREATE TYPE "VerifyState" AS ENUM ('unverified', 'valid', 'risky', 'invalid', 'catchall');

-- CreateEnum
CREATE TYPE "MsgStatus" AS ENUM ('queued', 'sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'replied', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "ReplyIntent" AS ENUM ('interested', 'question', 'not_interested', 'unsubscribe', 'out_of_office', 'hostile', 'other');

-- CreateEnum
CREATE TYPE "MailboxStatus" AS ENUM ('warming', 'active', 'paused', 'burned');

-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('warming', 'active', 'paused', 'burned');

-- CreateEnum
CREATE TYPE "ReviewItemType" AS ENUM ('low_confidence_classification', 'legal_gate_block', 'copy_violation', 'reply_draft');

-- CreateEnum
CREATE TYPE "ReviewItemStatus" AS ENUM ('open', 'approved', 'rejected', 'edited');

-- CreateTable
CREATE TABLE "Campaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "countryCode" TEXT NOT NULL,
    "geometry" JSONB NOT NULL,
    "includedTypes" TEXT[],
    "excludedTypes" TEXT[],
    "budgetUsdCap" DECIMAL(12,4) NOT NULL,
    "spendUsd" DECIMAL(12,4) NOT NULL DEFAULT 0,
    "maxLeads" INTEGER,
    "languageCode" TEXT,
    "includeHttpOnly" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Campaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tile" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "parentId" TEXT,
    "bbox" JSONB NOT NULL,
    "depth" INTEGER NOT NULL,
    "status" "TileStatus" NOT NULL DEFAULT 'pending',
    "resultCount" INTEGER NOT NULL DEFAULT 0,
    "liveSiteCount" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlaceRef" (
    "placeId" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlaceRef_pkey" PRIMARY KEY ("placeId")
);

-- CreateTable
CREATE TABLE "PlaceSnapshot" (
    "id" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "raw" JSONB NOT NULL,
    "fetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlaceSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Lead" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "tileId" TEXT,
    "correlationId" TEXT NOT NULL,
    "businessName" TEXT NOT NULL,
    "primaryType" TEXT,
    "vertical" TEXT,
    "countryCode" TEXT NOT NULL,
    "city" TEXT,
    "phone" TEXT,
    "websiteStatus" "WebsiteStatus" NOT NULL DEFAULT 'unknown',
    "websiteUrl" TEXT,
    "websiteProbe" JSONB,
    "rating" DOUBLE PRECISION,
    "reviewCount" INTEGER,
    "priceLevel" INTEGER,
    "businessStatus" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "score" DOUBLE PRECISION,
    "scoreBreakdown" JSONB,
    "stage" "LeadStage" NOT NULL DEFAULT 'discovered',
    "previousStage" "LeadStage",
    "legalGate" "LegalGate" NOT NULL DEFAULT 'pending',
    "legalGateReason" TEXT,
    "gateOverride" JSONB,
    "fallbackChannel" "FallbackChannel" NOT NULL DEFAULT 'email',
    "classification" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "lastTouchAt" TIMESTAMP(3),
    "contactDataPurgedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Lead_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailType" "EmailType" NOT NULL,
    "source" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceLicence" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL,
    "verification" "VerifyState" NOT NULL DEFAULT 'unverified',
    "verifiedAt" TIMESTAMP(3),
    "verifier" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedSite" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "colourScheme" TEXT NOT NULL DEFAULT 'a',
    "typography" TEXT NOT NULL DEFAULT 'a',
    "contentBrief" JSONB NOT NULL,
    "copy" JSONB NOT NULL,
    "copyViolations" JSONB,
    "buildHash" TEXT NOT NULL,
    "previewUrl" TEXT,
    "previewSlug" TEXT NOT NULL,
    "objectPrefix" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "takenDownAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "views" INTEGER NOT NULL DEFAULT 0,
    "lastViewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GeneratedSite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PreviewView" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "visitorHash" TEXT NOT NULL,
    "viewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PreviewView_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FormSubmission" (
    "id" TEXT NOT NULL,
    "siteId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "forwarded" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FormSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Quote" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "buildFee" DECIMAL(12,2) NOT NULL,
    "monthlyFee" DECIMAL(12,2) NOT NULL,
    "tier" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "allTiers" JSONB NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "stripeSessionId" TEXT,
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Quote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachMessage" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "sequenceStep" INTEGER NOT NULL,
    "mailboxId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "bodyText" TEXT NOT NULL,
    "status" "MsgStatus" NOT NULL DEFAULT 'queued',
    "providerId" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reply" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "messageId" TEXT,
    "fromEmail" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "subject" TEXT,
    "raw" TEXT NOT NULL,
    "intent" "ReplyIntent" NOT NULL DEFAULT 'other',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "classifiedBy" TEXT,
    "suggestedDraft" TEXT,
    "handled" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Reply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Suppression" (
    "id" TEXT NOT NULL,
    "emailHash" TEXT,
    "placeId" TEXT,
    "domain" TEXT,
    "reason" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Suppression_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SendingDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "status" "DomainStatus" NOT NULL DEFAULT 'warming',
    "dmarcPolicy" TEXT NOT NULL DEFAULT 'none',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SendingDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Mailbox" (
    "id" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "sendingDomainId" TEXT NOT NULL,
    "sendingDomain" TEXT NOT NULL,
    "dailyCap" INTEGER NOT NULL DEFAULT 5,
    "sentToday" INTEGER NOT NULL DEFAULT 0,
    "sentTodayDate" TIMESTAMP(3),
    "warmupStage" INTEGER NOT NULL DEFAULT 0,
    "warmupStartedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reputation" JSONB NOT NULL DEFAULT '{}',
    "status" "MailboxStatus" NOT NULL DEFAULT 'warming',
    "lastSentAt" TIMESTAMP(3),
    "pauseReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mailbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CostEvent" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT,
    "leadId" TEXT,
    "category" TEXT NOT NULL,
    "provider" TEXT,
    "units" INTEGER NOT NULL,
    "usd" DECIMAL(12,6) NOT NULL,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CostEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JurisdictionPolicy" (
    "countryCode" TEXT NOT NULL,
    "b2bColdEmailAllowed" BOOLEAN NOT NULL,
    "soleTraderTreatedAsIndividual" BOOLEAN NOT NULL,
    "priorConsentRequired" BOOLEAN NOT NULL,
    "requiresPhysicalAddressInFooter" BOOLEAN NOT NULL,
    "requiresDataSourceDisclosure" BOOLEAN NOT NULL,
    "maxFollowUps" INTEGER NOT NULL,
    "optOutHonourWindowHours" INTEGER NOT NULL,
    "defaultLanguageCode" TEXT NOT NULL DEFAULT 'en',
    "defaultCurrency" TEXT NOT NULL DEFAULT 'EUR',
    "notes" TEXT NOT NULL,
    "confirmedByCounsel" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JurisdictionPolicy_pkey" PRIMARY KEY ("countryCode")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actor" TEXT NOT NULL DEFAULT 'system',
    "leadId" TEXT,
    "subjectId" TEXT,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "type" "ReviewItemType" NOT NULL,
    "status" "ReviewItemStatus" NOT NULL DEFAULT 'open',
    "payload" JSONB NOT NULL,
    "resolution" JSONB,
    "resolvedBy" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PricingConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "config" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SequenceConfig" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "steps" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SequenceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "meta" JSONB,
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiQuota" (
    "id" TEXT NOT NULL,
    "api" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "cap" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ApiQuota_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Provisioning" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "checklist" JSONB NOT NULL,
    "onboardingForm" JSONB,
    "cmsKind" TEXT,
    "productionUrl" TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Provisioning_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceSubscription" (
    "id" TEXT NOT NULL,
    "provisioningId" TEXT NOT NULL,
    "tier" TEXT NOT NULL,
    "monthlyFee" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "updatesIncluded" INTEGER NOT NULL,
    "sla" JSONB NOT NULL,
    "stripeSubscriptionId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "ServiceSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UpdateRequest" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dueAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "billable" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "UpdateRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "stripeInvoiceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CrmTask" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "dueAt" TIMESTAMP(3),
    "doneAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CrmTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "Tile_campaignId_status_idx" ON "Tile"("campaignId", "status");

-- CreateIndex
CREATE INDEX "PlaceSnapshot_placeId_idx" ON "PlaceSnapshot"("placeId");

-- CreateIndex
CREATE INDEX "PlaceSnapshot_expiresAt_idx" ON "PlaceSnapshot"("expiresAt");

-- CreateIndex
CREATE INDEX "Lead_stage_score_idx" ON "Lead"("stage", "score");

-- CreateIndex
CREATE INDEX "Lead_campaignId_stage_idx" ON "Lead"("campaignId", "stage");

-- CreateIndex
CREATE INDEX "Lead_countryCode_idx" ON "Lead"("countryCode");

-- CreateIndex
CREATE INDEX "Lead_lastTouchAt_idx" ON "Lead"("lastTouchAt");

-- CreateIndex
CREATE UNIQUE INDEX "Lead_campaignId_placeId_key" ON "Lead"("campaignId", "placeId");

-- CreateIndex
CREATE UNIQUE INDEX "Contact_leadId_email_key" ON "Contact"("leadId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSite_leadId_key" ON "GeneratedSite"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "GeneratedSite_previewSlug_key" ON "GeneratedSite"("previewSlug");

-- CreateIndex
CREATE INDEX "PreviewView_siteId_viewedAt_idx" ON "PreviewView"("siteId", "viewedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_leadId_key" ON "Quote"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "Quote_slug_key" ON "Quote"("slug");

-- CreateIndex
CREATE INDEX "OutreachMessage_leadId_sequenceStep_idx" ON "OutreachMessage"("leadId", "sequenceStep");

-- CreateIndex
CREATE INDEX "OutreachMessage_status_scheduledFor_idx" ON "OutreachMessage"("status", "scheduledFor");

-- CreateIndex
CREATE INDEX "OutreachMessage_mailboxId_sentAt_idx" ON "OutreachMessage"("mailboxId", "sentAt");

-- CreateIndex
CREATE INDEX "Reply_leadId_idx" ON "Reply"("leadId");

-- CreateIndex
CREATE INDEX "Reply_handled_idx" ON "Reply"("handled");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_emailHash_key" ON "Suppression"("emailHash");

-- CreateIndex
CREATE UNIQUE INDEX "Suppression_placeId_key" ON "Suppression"("placeId");

-- CreateIndex
CREATE INDEX "Suppression_domain_idx" ON "Suppression"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "SendingDomain_domain_key" ON "SendingDomain"("domain");

-- CreateIndex
CREATE UNIQUE INDEX "Mailbox_address_key" ON "Mailbox"("address");

-- CreateIndex
CREATE INDEX "CostEvent_campaignId_category_idx" ON "CostEvent"("campaignId", "category");

-- CreateIndex
CREATE INDEX "CostEvent_createdAt_idx" ON "CostEvent"("createdAt");

-- CreateIndex
CREATE INDEX "LeadEvent_leadId_createdAt_idx" ON "LeadEvent"("leadId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_leadId_idx" ON "AuditLog"("leadId");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ReviewItem_status_type_idx" ON "ReviewItem"("status", "type");

-- CreateIndex
CREATE INDEX "Alert_acknowledgedAt_createdAt_idx" ON "Alert"("acknowledgedAt", "createdAt");

-- CreateIndex
CREATE INDEX "ApiQuota_api_day_idx" ON "ApiQuota"("api", "day");

-- CreateIndex
CREATE UNIQUE INDEX "Provisioning_leadId_key" ON "Provisioning"("leadId");

-- CreateIndex
CREATE UNIQUE INDEX "ServiceSubscription_provisioningId_key" ON "ServiceSubscription"("provisioningId");

-- CreateIndex
CREATE INDEX "UpdateRequest_subscriptionId_month_idx" ON "UpdateRequest"("subscriptionId", "month");

-- CreateIndex
CREATE INDEX "CrmTask_leadId_doneAt_idx" ON "CrmTask"("leadId", "doneAt");

-- AddForeignKey
ALTER TABLE "Tile" ADD CONSTRAINT "Tile_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlaceSnapshot" ADD CONSTRAINT "PlaceSnapshot_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "PlaceRef"("placeId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "PlaceRef"("placeId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Lead" ADD CONSTRAINT "Lead_tileId_fkey" FOREIGN KEY ("tileId") REFERENCES "Tile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedSite" ADD CONSTRAINT "GeneratedSite_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PreviewView" ADD CONSTRAINT "PreviewView_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "GeneratedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FormSubmission" ADD CONSTRAINT "FormSubmission_siteId_fkey" FOREIGN KEY ("siteId") REFERENCES "GeneratedSite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Quote" ADD CONSTRAINT "Quote_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "Contact"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachMessage" ADD CONSTRAINT "OutreachMessage_mailboxId_fkey" FOREIGN KEY ("mailboxId") REFERENCES "Mailbox"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reply" ADD CONSTRAINT "Reply_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "OutreachMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Mailbox" ADD CONSTRAINT "Mailbox_sendingDomainId_fkey" FOREIGN KEY ("sendingDomainId") REFERENCES "SendingDomain"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CostEvent" ADD CONSTRAINT "CostEvent_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "Campaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeadEvent" ADD CONSTRAINT "LeadEvent_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Provisioning" ADD CONSTRAINT "Provisioning_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ServiceSubscription" ADD CONSTRAINT "ServiceSubscription_provisioningId_fkey" FOREIGN KEY ("provisioningId") REFERENCES "Provisioning"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UpdateRequest" ADD CONSTRAINT "UpdateRequest_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ServiceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_subscriptionId_fkey" FOREIGN KEY ("subscriptionId") REFERENCES "ServiceSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CrmTask" ADD CONSTRAINT "CrmTask_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "Lead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
