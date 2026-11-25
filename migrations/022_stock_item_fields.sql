BEGIN;

CREATE SEQUENCE IF NOT EXISTS "public"."stock_item_code_seq" AS bigint;

ALTER TABLE "public"."stock_items"
    ADD COLUMN IF NOT EXISTS "item_code" varchar(32),
    ADD COLUMN IF NOT EXISTS "image_url" varchar(2048),
    ADD COLUMN IF NOT EXISTS "expiry_date" date,
    ADD COLUMN IF NOT EXISTS "display_order" integer NOT NULL DEFAULT 0
        CHECK ("display_order" >= 0);

UPDATE "public"."stock_items"
SET "item_code" = 'ITM-' || CASE
    WHEN nextval('public.stock_item_code_seq'::regclass) < 1000000
        THEN lpad(currval('public.stock_item_code_seq'::regclass)::text, 6, '0')
    ELSE currval('public.stock_item_code_seq'::regclass)::text
END
WHERE "item_code" IS NULL;

SELECT setval(
    'public.stock_item_code_seq'::regclass,
    COALESCE(MAX(substring("item_code" FROM '^ITM-([0-9]+)$')::bigint), 0) + 1,
    false
)
FROM "public"."stock_items";

ALTER TABLE "public"."stock_items"
    ALTER COLUMN "item_code"
        SET DEFAULT 'ITM-' || CASE
            WHEN nextval('public.stock_item_code_seq'::regclass) < 1000000
                THEN lpad(currval('public.stock_item_code_seq'::regclass)::text, 6, '0')
            ELSE currval('public.stock_item_code_seq'::regclass)::text
        END,
    ALTER COLUMN "item_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_item_code_unique"
    ON "public"."stock_items" ("item_code");
CREATE INDEX IF NOT EXISTS "stock_items_display_order_idx"
    ON "public"."stock_items" ("display_order");

COMMIT;
