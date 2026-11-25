BEGIN;

ALTER TABLE "public"."staff_profiles"
    ADD COLUMN IF NOT EXISTS "employeeId" varchar(40),
    ADD COLUMN IF NOT EXISTS "emergencyContact" jsonb NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS "staff_profiles_employeeId_unique"
    ON "public"."staff_profiles" ("employeeId")
    WHERE "employeeId" IS NOT NULL;

CREATE TABLE IF NOT EXISTS "public"."staff_role_assignments" (
    "id" uuid PRIMARY KEY,
    "staffId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "roleId" varchar(30) NOT NULL REFERENCES "public"."roles" ("id") ON DELETE RESTRICT,
    "customProfitPercentage" numeric(7,4),
    "effectiveFrom" date NOT NULL,
    "effectiveTo" date,
    "status" varchar(20) NOT NULL DEFAULT 'active',
    "createdBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "updatedBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "staff_role_assignment_unique_active"
    ON "public"."staff_role_assignments" ("staffId", "roleId")
    WHERE "status" = 'active';
CREATE INDEX IF NOT EXISTS "staff_role_assignment_dates_idx"
    ON "public"."staff_role_assignments" ("staffId", "roleId", "effectiveFrom", "effectiveTo");

CREATE TABLE IF NOT EXISTS "public"."role_profit_share_configurations" (
    "id" uuid PRIMARY KEY,
    "roleId" varchar(30) NOT NULL REFERENCES "public"."roles" ("id") ON DELETE CASCADE,
    "defaultProfitPercentage" numeric(7,4) NOT NULL,
    "effectiveFrom" date NOT NULL,
    "effectiveTo" date,
    "status" varchar(20) NOT NULL DEFAULT 'active',
    "createdBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "role_profit_share_dates_idx"
    ON "public"."role_profit_share_configurations" ("roleId", "effectiveFrom", "effectiveTo");

CREATE TABLE IF NOT EXISTS "public"."profit_share_calculations" (
    "id" uuid PRIMARY KEY,
    "businessDate" date NOT NULL,
    "calculationVersion" integer NOT NULL DEFAULT 1,
    "eligibleNetProfit" numeric(14,2) NOT NULL,
    "revenueBreakdown" jsonb NOT NULL DEFAULT '{}',
    "expenseBreakdown" jsonb NOT NULL DEFAULT '{}',
    "totalAllocationPercentage" numeric(7,4) NOT NULL,
    "totalProfitShare" numeric(14,2) NOT NULL,
    "status" varchar(30) NOT NULL DEFAULT 'draft',
    "calculatedBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "calculatedAt" timestamptz NOT NULL DEFAULT now(),
    "approvedBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "approvedAt" timestamptz,
    "rejectedBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "rejectedAt" timestamptz,
    "remarks" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("businessDate", "calculationVersion")
);

CREATE TABLE IF NOT EXISTS "public"."profit_share_calculation_details" (
    "id" uuid PRIMARY KEY,
    "calculationId" uuid NOT NULL REFERENCES "public"."profit_share_calculations" ("id") ON DELETE CASCADE,
    "staffId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "roleId" varchar(30) NOT NULL REFERENCES "public"."roles" ("id") ON DELETE RESTRICT,
    "roleAssignmentId" uuid NOT NULL REFERENCES "public"."staff_role_assignments" ("id") ON DELETE RESTRICT,
    "appliedPercentage" numeric(7,4) NOT NULL,
    "eligibleNetProfit" numeric(14,2) NOT NULL,
    "calculatedShare" numeric(14,2) NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("calculationId", "staffId", "roleId")
);

CREATE TABLE IF NOT EXISTS "public"."profit_share_approvals" (
    "id" uuid PRIMARY KEY,
    "calculationId" uuid NOT NULL REFERENCES "public"."profit_share_calculations" ("id") ON DELETE CASCADE,
    "action" varchar(20) NOT NULL,
    "actedBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "actedAt" timestamptz NOT NULL DEFAULT now(),
    "remarks" text,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."profit_share_adjustments" (
    "id" uuid PRIMARY KEY,
    "calculationId" uuid NOT NULL REFERENCES "public"."profit_share_calculations" ("id") ON DELETE CASCADE,
    "calculationDetailId" uuid REFERENCES "public"."profit_share_calculation_details" ("id") ON DELETE CASCADE,
    "previousAmount" numeric(14,2) NOT NULL,
    "adjustedAmount" numeric(14,2) NOT NULL,
    "reason" text NOT NULL,
    "adjustedBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."profit_share_payments" (
    "id" uuid PRIMARY KEY,
    "paymentReference" varchar(100),
    "idempotencyKey" varchar(100) UNIQUE,
    "paymentDate" date NOT NULL,
    "paymentMethod" varchar(30) NOT NULL,
    "totalAmount" numeric(14,2) NOT NULL,
    "status" varchar(20) NOT NULL DEFAULT 'successful',
    "remarks" text,
    "createdBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."profit_share_payment_details" (
    "id" uuid PRIMARY KEY,
    "paymentId" uuid NOT NULL REFERENCES "public"."profit_share_payments" ("id") ON DELETE CASCADE,
    "calculationDetailId" uuid NOT NULL REFERENCES "public"."profit_share_calculation_details" ("id") ON DELETE RESTRICT,
    "staffId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "allocatedAmount" numeric(14,2) NOT NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."staff_activity_logs" (
    "id" uuid PRIMARY KEY,
    "staffId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "action" varchar(80) NOT NULL,
    "actorId" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "details" jsonb NOT NULL DEFAULT '{}',
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "public"."permissions" ("id", "description", "createdAt", "updatedAt") VALUES
    ('staff:view', 'View staff', now(), now()),
    ('staff:create', 'Create staff', now(), now()),
    ('staff:update', 'Update staff', now(), now()),
    ('staff:manage_roles', 'Manage staff role assignments', now(), now()),
    ('profit_share:view', 'View profit sharing', now(), now()),
    ('profit_share:calculate', 'Calculate profit sharing', now(), now()),
    ('profit_share:approve', 'Approve profit sharing', now(), now()),
    ('profit_share:reject', 'Reject profit sharing', now(), now()),
    ('profit_share:adjust', 'Adjust approved profit sharing', now(), now()),
    ('profit_share:payments:view', 'View profit share payments', now(), now()),
    ('profit_share:payments:create', 'Record profit share payments', now(), now()),
    ('profit_share:reports:view', 'View profit share reports', now(), now())
ON CONFLICT ("id") DO NOTHING;

COMMIT;
