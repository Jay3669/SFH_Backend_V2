BEGIN;

CREATE TABLE IF NOT EXISTS "public"."stock_items" (
    "id" uuid PRIMARY KEY,
    "name" varchar(120) NOT NULL,
    "sku" varchar(64),
    "category" varchar(80) NOT NULL DEFAULT 'General',
    "unit" varchar(24) NOT NULL,
    "quantity" numeric(14, 3) NOT NULL DEFAULT 0 CHECK ("quantity" >= 0),
    "reorderLevel" numeric(14, 3) NOT NULL DEFAULT 0 CHECK ("reorderLevel" >= 0),
    "unitCost" numeric(14, 2) NOT NULL DEFAULT 0 CHECK ("unitCost" >= 0),
    "isActive" boolean NOT NULL DEFAULT true,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_sku_unique"
    ON "public"."stock_items" ("sku") WHERE "sku" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "stock_items_category_idx"
    ON "public"."stock_items" ("category");
CREATE INDEX IF NOT EXISTS "stock_items_active_idx"
    ON "public"."stock_items" ("isActive");

CREATE TABLE IF NOT EXISTS "public"."stock_movements" (
    "id" uuid PRIMARY KEY,
    "stockItemId" uuid NOT NULL REFERENCES "public"."stock_items" ("id") ON DELETE RESTRICT,
    "type" varchar(12) NOT NULL CHECK ("type" IN ('in', 'out', 'count')),
    "quantity" numeric(14, 3) NOT NULL CHECK ("quantity" >= 0),
    "change" numeric(14, 3) NOT NULL,
    "beforeQuantity" numeric(14, 3) NOT NULL CHECK ("beforeQuantity" >= 0),
    "afterQuantity" numeric(14, 3) NOT NULL CHECK ("afterQuantity" >= 0),
    "unit" varchar(24) NOT NULL,
    "reason" varchar(255) NOT NULL,
    "actorUserId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "stock_movements_item_created_idx"
    ON "public"."stock_movements" ("stockItemId", "createdAt");
CREATE INDEX IF NOT EXISTS "stock_movements_created_idx"
    ON "public"."stock_movements" ("createdAt");

COMMIT;

