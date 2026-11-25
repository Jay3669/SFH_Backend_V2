BEGIN;

ALTER TABLE "public"."stock_items"
    ADD COLUMN IF NOT EXISTS "sku" varchar(64);

CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_sku_unique"
    ON "public"."stock_items" ("sku") WHERE "sku" IS NOT NULL;

COMMIT;
