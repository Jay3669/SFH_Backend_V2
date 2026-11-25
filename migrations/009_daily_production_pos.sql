BEGIN;

ALTER TABLE "public"."production_records"
    ADD COLUMN IF NOT EXISTS "sellingPricePerPlate" numeric(12, 2) NOT NULL DEFAULT 0;
UPDATE "public"."production_records" AS production
SET "sellingPricePerPlate" = menu."price"
FROM "public"."menu_items" AS menu
WHERE production."menuItemId" = menu."id"
  AND production."sellingPricePerPlate" = 0;

CREATE TABLE IF NOT EXISTS "public"."production_days" (
    "productionDate" date PRIMARY KEY,
    "isClosed" boolean NOT NULL DEFAULT false,
    "closedAt" timestamptz,
    "closedBy" uuid REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "totalProducedPlates" numeric(14, 3) NOT NULL DEFAULT 0 CHECK ("totalProducedPlates" >= 0),
    "totalSoldPlates" numeric(14, 3) NOT NULL DEFAULT 0 CHECK ("totalSoldPlates" >= 0),
    "totalWastagePlates" numeric(14, 3) NOT NULL DEFAULT 0 CHECK ("totalWastagePlates" >= 0),
    "totalProductionCost" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("totalProductionCost" >= 0),
    "totalSalesRevenue" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("totalSalesRevenue" >= 0),
    "totalWastageCost" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("totalWastageCost" >= 0),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."production_day_items" (
    "id" uuid PRIMARY KEY,
    "productionDate" date NOT NULL REFERENCES "public"."production_days" ("productionDate") ON DELETE RESTRICT,
    "menuItemId" uuid NOT NULL REFERENCES "public"."menu_items" ("id") ON DELETE RESTRICT,
    "menuItemName" varchar(120) NOT NULL,
    "producedPlates" numeric(14, 3) NOT NULL CHECK ("producedPlates" >= 0),
    "soldPlates" numeric(14, 3) NOT NULL CHECK ("soldPlates" >= 0),
    "wastagePlates" numeric(14, 3) NOT NULL CHECK ("wastagePlates" >= 0),
    "productionCost" numeric(14, 2) NOT NULL CHECK ("productionCost" >= 0),
    "salesRevenue" numeric(14, 2) NOT NULL CHECK ("salesRevenue" >= 0),
    "wastageCost" numeric(14, 2) NOT NULL CHECK ("wastageCost" >= 0),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("productionDate", "menuItemId")
);

CREATE TABLE IF NOT EXISTS "public"."production_sales" (
    "id" uuid PRIMARY KEY,
    "reference" varchar(40) NOT NULL UNIQUE,
    "idempotencyKey" varchar(100) NOT NULL UNIQUE,
    "requestHash" char(64) NOT NULL,
    "productionDate" date NOT NULL REFERENCES "public"."production_days" ("productionDate") ON DELETE RESTRICT,
    "subtotal" numeric(14, 2) NOT NULL CHECK ("subtotal" >= 0),
    "discountAmount" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
    "taxRate" numeric(5, 2) NOT NULL DEFAULT 0 CHECK ("taxRate" BETWEEN 0 AND 100),
    "taxAmount" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("taxAmount" >= 0),
    "packingCharge" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("packingCharge" >= 0),
    "totalAmount" numeric(14, 2) NOT NULL CHECK ("totalAmount" >= 0),
    "paymentMethod" varchar(16) NOT NULL CHECK ("paymentMethod" IN ('cash', 'upi', 'card')),
    "paymentStatus" varchar(16) NOT NULL DEFAULT 'completed' CHECK ("paymentStatus" IN ('completed', 'failed', 'cancelled')),
    "cashierId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "production_sales_date_status_idx"
    ON "public"."production_sales" ("productionDate", "paymentStatus");

CREATE TABLE IF NOT EXISTS "public"."production_sale_items" (
    "id" uuid PRIMARY KEY,
    "saleId" uuid NOT NULL REFERENCES "public"."production_sales" ("id") ON DELETE RESTRICT,
    "productionRecordId" uuid NOT NULL REFERENCES "public"."production_records" ("id") ON DELETE RESTRICT,
    "menuItemId" uuid NOT NULL REFERENCES "public"."menu_items" ("id") ON DELETE RESTRICT,
    "menuItemName" varchar(120) NOT NULL,
    "quantity" numeric(14, 3) NOT NULL CHECK ("quantity" > 0),
    "unitPrice" numeric(12, 2) NOT NULL CHECK ("unitPrice" >= 0),
    "costPerPlate" numeric(14, 2) NOT NULL CHECK ("costPerPlate" >= 0),
    "discountAmount" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("discountAmount" >= 0),
    "totalPrice" numeric(14, 2) NOT NULL CHECK ("totalPrice" >= 0),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "production_sale_items_sale_idx"
    ON "public"."production_sale_items" ("saleId");
CREATE INDEX IF NOT EXISTS "production_sale_items_record_idx"
    ON "public"."production_sale_items" ("productionRecordId");

CREATE TABLE IF NOT EXISTS "public"."operating_expenses" (
    "id" uuid PRIMARY KEY,
    "expenseDate" date NOT NULL,
    "category" varchar(60) NOT NULL,
    "description" varchar(255) NOT NULL,
    "amount" numeric(14, 2) NOT NULL CHECK ("amount" > 0),
    "createdBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "operating_expenses_date_idx"
    ON "public"."operating_expenses" ("expenseDate");

COMMIT;
