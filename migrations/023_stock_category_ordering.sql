BEGIN;

LOCK TABLE "public"."stock_categories" IN SHARE ROW EXCLUSIVE MODE;

ALTER TABLE "public"."stock_categories"
    ALTER COLUMN "display_order" DROP DEFAULT,
    ALTER COLUMN "display_order" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stock_categories_display_order_unique'
          AND conrelid = '"public"."stock_categories"'::regclass
    ) THEN
        WITH ordered_categories AS (
            SELECT
                "id",
                ROW_NUMBER() OVER (
                    ORDER BY
                        CASE WHEN "display_order" > 0 THEN 0 ELSE 1 END,
                        "display_order",
                        "name",
                        "id"
                )::integer AS next_order
            FROM "public"."stock_categories"
        )
        UPDATE "public"."stock_categories" AS category
        SET "display_order" = ordered_categories.next_order
        FROM ordered_categories
        WHERE category."id" = ordered_categories."id";

        ALTER TABLE "public"."stock_categories"
            ADD CONSTRAINT "stock_categories_display_order_unique"
            UNIQUE ("display_order")
            DEFERRABLE INITIALLY DEFERRED;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'stock_categories_display_order_positive'
          AND conrelid = '"public"."stock_categories"'::regclass
    ) THEN
        ALTER TABLE "public"."stock_categories"
            ADD CONSTRAINT "stock_categories_display_order_positive"
            CHECK ("display_order" >= 1);
    END IF;
END;
$$;

COMMIT;
