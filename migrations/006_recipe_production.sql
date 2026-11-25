BEGIN;

CREATE TABLE IF NOT EXISTS "public"."menu_items" (
    "id" uuid PRIMARY KEY,
    "name" varchar(120) NOT NULL,
    "category" varchar(80) NOT NULL,
    "isVegetarian" boolean NOT NULL DEFAULT false,
    "description" text,
    "imageUrl" varchar(2048),
    "isActive" boolean NOT NULL DEFAULT true,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "menu_items_active_name_idx"
    ON "public"."menu_items" ("isActive", "name");

CREATE TABLE IF NOT EXISTS "public"."recipes" (
    "id" uuid PRIMARY KEY,
    "menuItemId" uuid NOT NULL UNIQUE REFERENCES "public"."menu_items" ("id") ON DELETE RESTRICT,
    "name" varchar(120) NOT NULL,
    "currentVersion" integer NOT NULL DEFAULT 1 CHECK ("currentVersion" > 0),
    "isArchived" boolean NOT NULL DEFAULT false,
    "createdBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "updatedBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."recipe_versions" (
    "id" uuid PRIMARY KEY,
    "recipeId" uuid NOT NULL REFERENCES "public"."recipes" ("id") ON DELETE RESTRICT,
    "version" integer NOT NULL CHECK ("version" > 0),
    "baseProductionQuantity" numeric(14, 3) NOT NULL CHECK ("baseProductionQuantity" > 0),
    "baseProductionUnit" varchar(24) NOT NULL,
    "expectedPlateCount" numeric(14, 3) NOT NULL CHECK ("expectedPlateCount" > 0),
    "servingSize" numeric(14, 3),
    "servingUnit" varchar(24),
    "preparationInstructions" text,
    "cookingTimeMinutes" integer CHECK ("cookingTimeMinutes" IS NULL OR "cookingTimeMinutes" >= 0),
    "wastagePercentage" numeric(5, 2) NOT NULL DEFAULT 0 CHECK ("wastagePercentage" BETWEEN 0 AND 100),
    "createdBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "updatedBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("recipeId", "version")
);

CREATE TABLE IF NOT EXISTS "public"."recipe_ingredients" (
    "id" uuid PRIMARY KEY,
    "recipeVersionId" uuid NOT NULL REFERENCES "public"."recipe_versions" ("id") ON DELETE RESTRICT,
    "stockItemId" uuid NOT NULL REFERENCES "public"."stock_items" ("id") ON DELETE RESTRICT,
    "quantity" numeric(14, 3) NOT NULL CHECK ("quantity" > 0),
    "unit" varchar(24) NOT NULL,
    "preparationNotes" varchar(255),
    "wastagePercentage" numeric(5, 2) NOT NULL DEFAULT 0 CHECK ("wastagePercentage" BETWEEN 0 AND 100),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("recipeVersionId", "stockItemId")
);

CREATE TABLE IF NOT EXISTS "public"."production_records" (
    "id" uuid PRIMARY KEY,
    "reference" varchar(40) NOT NULL UNIQUE,
    "idempotencyKey" varchar(100) NOT NULL UNIQUE,
    "requestHash" char(64) NOT NULL,
    "menuItemId" uuid NOT NULL REFERENCES "public"."menu_items" ("id") ON DELETE RESTRICT,
    "recipeVersionId" uuid NOT NULL REFERENCES "public"."recipe_versions" ("id") ON DELETE RESTRICT,
    "productionDate" date NOT NULL,
    "productionQuantity" numeric(14, 3) NOT NULL CHECK ("productionQuantity" > 0),
    "productionUnit" varchar(24) NOT NULL,
    "expectedPlateCount" numeric(14, 3) NOT NULL CHECK ("expectedPlateCount" > 0),
    "actualPlateCount" numeric(14, 3) CHECK ("actualPlateCount" IS NULL OR "actualPlateCount" >= 0),
    "totalIngredientCost" numeric(14, 2) NOT NULL CHECK ("totalIngredientCost" >= 0),
    "additionalCost" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("additionalCost" >= 0),
    "totalProductionCost" numeric(14, 2) NOT NULL CHECK ("totalProductionCost" >= 0),
    "costPerKg" numeric(14, 2),
    "costPerPlate" numeric(14, 2) NOT NULL CHECK ("costPerPlate" >= 0),
    "notes" varchar(1000),
    "preparedBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "status" varchar(16) NOT NULL DEFAULT 'confirmed' CHECK ("status" IN ('confirmed', 'cancelled')),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "production_records_date_status_idx"
    ON "public"."production_records" ("productionDate", "status");
CREATE INDEX IF NOT EXISTS "production_records_menu_date_idx"
    ON "public"."production_records" ("menuItemId", "productionDate");
CREATE INDEX IF NOT EXISTS "production_records_prepared_by_idx"
    ON "public"."production_records" ("preparedBy");

CREATE TABLE IF NOT EXISTS "public"."production_ingredients" (
    "id" uuid PRIMARY KEY,
    "productionRecordId" uuid NOT NULL REFERENCES "public"."production_records" ("id") ON DELETE RESTRICT,
    "recipeIngredientId" uuid REFERENCES "public"."recipe_ingredients" ("id") ON DELETE RESTRICT,
    "stockItemId" uuid NOT NULL REFERENCES "public"."stock_items" ("id") ON DELETE RESTRICT,
    "ingredientName" varchar(120) NOT NULL,
    "theoreticalQuantity" numeric(14, 3) NOT NULL CHECK ("theoreticalQuantity" > 0),
    "quantityDeducted" numeric(14, 3) NOT NULL CHECK ("quantityDeducted" >= "theoreticalQuantity"),
    "unit" varchar(24) NOT NULL,
    "wastagePercentage" numeric(5, 2) NOT NULL DEFAULT 0 CHECK ("wastagePercentage" BETWEEN 0 AND 100),
    "recipeWastagePercentage" numeric(5, 2) NOT NULL DEFAULT 0 CHECK ("recipeWastagePercentage" BETWEEN 0 AND 100),
    "unitCost" numeric(14, 2) NOT NULL CHECK ("unitCost" >= 0),
    "totalCost" numeric(14, 2) NOT NULL CHECK ("totalCost" >= 0),
    "balanceAfter" numeric(14, 3) NOT NULL CHECK ("balanceAfter" >= 0),
    "stockMovementId" uuid NOT NULL REFERENCES "public"."stock_movements" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "production_ingredients_record_idx"
    ON "public"."production_ingredients" ("productionRecordId");

CREATE TABLE IF NOT EXISTS "public"."production_cost_details" (
    "id" uuid PRIMARY KEY,
    "productionRecordId" uuid NOT NULL REFERENCES "public"."production_records" ("id") ON DELETE RESTRICT,
    "name" varchar(80) NOT NULL,
    "amount" numeric(14, 2) NOT NULL CHECK ("amount" >= 0),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."production_cancellations" (
    "id" uuid PRIMARY KEY,
    "productionRecordId" uuid NOT NULL UNIQUE REFERENCES "public"."production_records" ("id") ON DELETE RESTRICT,
    "reason" varchar(255) NOT NULL,
    "notes" varchar(1000),
    "cancelledBy" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "cancelledAt" timestamptz NOT NULL DEFAULT now(),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."production_recoveries" (
    "id" uuid PRIMARY KEY,
    "cancellationId" uuid NOT NULL REFERENCES "public"."production_cancellations" ("id") ON DELETE RESTRICT,
    "productionIngredientId" uuid NOT NULL REFERENCES "public"."production_ingredients" ("id") ON DELETE RESTRICT,
    "quantityRecovered" numeric(14, 3) NOT NULL CHECK ("quantityRecovered" > 0),
    "unit" varchar(24) NOT NULL,
    "stockMovementId" uuid NOT NULL REFERENCES "public"."stock_movements" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("cancellationId", "productionIngredientId")
);

ALTER TABLE "public"."stock_movements"
    ADD COLUMN IF NOT EXISTS "referenceType" varchar(32),
    ADD COLUMN IF NOT EXISTS "referenceId" uuid,
    ADD COLUMN IF NOT EXISTS "totalCost" numeric(14, 2)
    CHECK ("totalCost" IS NULL OR "totalCost" >= 0);
CREATE INDEX IF NOT EXISTS "stock_movements_reference_idx"
    ON "public"."stock_movements" ("referenceType", "referenceId");

COMMIT;
