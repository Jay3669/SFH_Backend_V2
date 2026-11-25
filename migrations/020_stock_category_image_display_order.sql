BEGIN;

ALTER TABLE "public"."stock_categories"
    ADD COLUMN IF NOT EXISTS "image_url" varchar(2048),
    ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0
        CHECK ("display_order" >= 0);

CREATE INDEX IF NOT EXISTS "stock_categories_display_order_idx"
    ON "public"."stock_categories" ("display_order");

COMMIT;
