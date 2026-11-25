BEGIN;

CREATE SEQUENCE IF NOT EXISTS "public"."stock_category_code_seq" AS bigint;

ALTER TABLE "public"."stock_categories"
    ADD COLUMN IF NOT EXISTS "category_code" varchar(32);

UPDATE "public"."stock_categories"
SET "category_code" = 'CAT-' || CASE
    WHEN nextval('public.stock_category_code_seq'::regclass) < 1000000
        THEN lpad(currval('public.stock_category_code_seq'::regclass)::text, 6, '0')
    ELSE currval('public.stock_category_code_seq'::regclass)::text
END
WHERE "category_code" IS NULL;

SELECT setval(
    'public.stock_category_code_seq'::regclass,
    COALESCE(MAX(substring("category_code" FROM '^CAT-([0-9]+)$')::bigint), 0) + 1,
    false
)
FROM "public"."stock_categories";

ALTER TABLE "public"."stock_categories"
    ALTER COLUMN "category_code"
        SET DEFAULT 'CAT-' || CASE
            WHEN nextval('public.stock_category_code_seq'::regclass) < 1000000
                THEN lpad(currval('public.stock_category_code_seq'::regclass)::text, 6, '0')
            ELSE currval('public.stock_category_code_seq'::regclass)::text
        END,
    ALTER COLUMN "category_code" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_categories_category_code_unique"
    ON "public"."stock_categories" ("category_code");

COMMIT;