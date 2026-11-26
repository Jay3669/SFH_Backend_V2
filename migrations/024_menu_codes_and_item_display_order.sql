BEGIN;

CREATE SEQUENCE IF NOT EXISTS "public"."menu_category_code_seq" AS bigint;

ALTER TABLE "public"."menu_categories"
    ADD COLUMN IF NOT EXISTS "category_code" varchar(32);

UPDATE "public"."menu_categories"
SET "category_code" = 'MCAT-' || CASE
    WHEN nextval('public.menu_category_code_seq'::regclass) < 1000000
        THEN lpad(currval('public.menu_category_code_seq'::regclass)::text, 6, '0')
    ELSE currval('public.menu_category_code_seq'::regclass)::text
END
WHERE "category_code" IS NULL;

SELECT setval(
    'public.menu_category_code_seq'::regclass,
    COALESCE(MAX(substring("category_code" FROM '^MCAT-([0-9]+)$')::bigint), 0) + 1,
    false
)
FROM "public"."menu_categories";

ALTER TABLE "public"."menu_categories"
    ALTER COLUMN "category_code"
        SET DEFAULT 'MCAT-' || CASE
            WHEN nextval('public.menu_category_code_seq'::regclass) < 1000000
                THEN lpad(currval('public.menu_category_code_seq'::regclass)::text, 6, '0')
            ELSE currval('public.menu_category_code_seq'::regclass)::text
        END,
    ALTER COLUMN "category_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "menu_categories_category_code_unique"
    ON "public"."menu_categories" ("category_code");

CREATE SEQUENCE IF NOT EXISTS "public"."menu_item_code_seq" AS bigint;

ALTER TABLE "public"."menu_items"
    ADD COLUMN IF NOT EXISTS "item_code" varchar(32),
    ADD COLUMN IF NOT EXISTS "display_order" integer;

UPDATE "public"."menu_items"
SET "item_code" = 'MITM-' || CASE
    WHEN nextval('public.menu_item_code_seq'::regclass) < 1000000
        THEN lpad(currval('public.menu_item_code_seq'::regclass)::text, 6, '0')
    ELSE currval('public.menu_item_code_seq'::regclass)::text
END
WHERE "item_code" IS NULL;

SELECT setval(
    'public.menu_item_code_seq'::regclass,
    COALESCE(MAX(substring("item_code" FROM '^MITM-([0-9]+)$')::bigint), 0) + 1,
    false
)
FROM "public"."menu_items";

ALTER TABLE "public"."menu_items"
    ALTER COLUMN "item_code"
        SET DEFAULT 'MITM-' || CASE
            WHEN nextval('public.menu_item_code_seq'::regclass) < 1000000
                THEN lpad(currval('public.menu_item_code_seq'::regclass)::text, 6, '0')
            ELSE currval('public.menu_item_code_seq'::regclass)::text
        END,
    ALTER COLUMN "item_code" SET NOT NULL;

WITH ordered_items AS (
    SELECT
        "id",
        ROW_NUMBER() OVER (ORDER BY "name" ASC, "id" ASC)::integer AS next_order
    FROM "public"."menu_items"
    WHERE "display_order" IS NULL
)
UPDATE "public"."menu_items" AS item
SET "display_order" = ordered_items.next_order
FROM ordered_items
WHERE item."id" = ordered_items."id";

ALTER TABLE "public"."menu_items"
    ALTER COLUMN "display_order" SET DEFAULT 0,
    ALTER COLUMN "display_order" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "menu_items_item_code_unique"
    ON "public"."menu_items" ("item_code");
CREATE INDEX IF NOT EXISTS "menu_items_display_order_idx"
    ON "public"."menu_items" ("display_order");

COMMIT;
