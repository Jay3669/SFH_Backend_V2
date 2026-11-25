BEGIN;

ALTER TABLE "public"."production_sales"
    ADD COLUMN IF NOT EXISTS "customerId" uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'production_sales_customerId_fkey'
          AND conrelid = '"public"."production_sales"'::regclass
    ) THEN
        ALTER TABLE "public"."production_sales"
            ADD CONSTRAINT "production_sales_customerId_fkey"
            FOREIGN KEY ("customerId") REFERENCES "public"."customers" ("id") ON DELETE SET NULL;
    END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS "production_sales_customer_date_idx"
    ON "public"."production_sales" ("customerId", "productionDate");

COMMIT;
