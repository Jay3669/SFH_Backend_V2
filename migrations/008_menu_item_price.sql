BEGIN;

ALTER TABLE "public"."menu_items"
    ADD COLUMN IF NOT EXISTS "price" numeric(12, 2) NOT NULL DEFAULT 0;

UPDATE "public"."menu_items"
SET "price" = 0
WHERE "price" IS NULL;

ALTER TABLE "public"."menu_items"
    ALTER COLUMN "price" SET DEFAULT 0,
    ALTER COLUMN "price" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'menu_items_price_nonnegative_check'
          AND conrelid = '"public"."menu_items"'::regclass
    ) THEN
        ALTER TABLE "public"."menu_items"
            ADD CONSTRAINT "menu_items_price_nonnegative_check"
            CHECK ("price" >= 0);
    END IF;
END
$$;

COMMIT;
