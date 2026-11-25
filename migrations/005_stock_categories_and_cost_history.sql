BEGIN;

CREATE TABLE IF NOT EXISTS "public"."stock_categories" (
    "id" uuid PRIMARY KEY,
    "name" varchar(80) NOT NULL,
    "description" varchar(255),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "public"."stock_categories" ("id", "name", "createdAt", "updatedAt")
SELECT gen_random_uuid(), MIN(category_name), now(), now()
FROM (
    SELECT COALESCE(NULLIF(BTRIM("category"), ''), 'General') AS category_name
    FROM "public"."stock_items"
    UNION ALL
    SELECT 'General'
) AS normalized_categories
GROUP BY LOWER(category_name)
ON CONFLICT DO NOTHING;

ALTER TABLE "public"."stock_items"
    ADD COLUMN IF NOT EXISTS "categoryId" uuid;

UPDATE "public"."stock_items" AS item
SET "categoryId" = category.id
FROM "public"."stock_categories" AS category
WHERE LOWER(category.name) = LOWER(COALESCE(NULLIF(BTRIM(item.category), ''), 'General'))
  AND item."categoryId" IS NULL;

ALTER TABLE "public"."stock_items"
    ALTER COLUMN "categoryId" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stock_items_category_id_fkey'
          AND conrelid = '"public"."stock_items"'::regclass
    ) THEN
        ALTER TABLE "public"."stock_items"
            ADD CONSTRAINT "stock_items_category_id_fkey"
            FOREIGN KEY ("categoryId")
            REFERENCES "public"."stock_categories" ("id")
            ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "stock_categories_name_lower_unique"
    ON "public"."stock_categories" (LOWER("name"));
CREATE INDEX IF NOT EXISTS "stock_items_category_id_idx"
    ON "public"."stock_items" ("categoryId");

ALTER TABLE "public"."stock_movements"
    ADD COLUMN IF NOT EXISTS "unitCost" numeric(14, 2)
    CHECK ("unitCost" IS NULL OR "unitCost" >= 0);

CREATE INDEX IF NOT EXISTS "stock_movements_type_created_idx"
    ON "public"."stock_movements" ("type", "createdAt");

COMMIT;
