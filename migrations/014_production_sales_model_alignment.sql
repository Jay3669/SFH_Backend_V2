BEGIN;

ALTER TABLE "public"."production_sales"
    ADD COLUMN IF NOT EXISTS "reference" varchar(40),
    ADD COLUMN IF NOT EXISTS "idempotencyKey" varchar(100),
    ADD COLUMN IF NOT EXISTS "requestHash" char(64),
    ADD COLUMN IF NOT EXISTS "additionalCharges" jsonb NOT NULL DEFAULT '[]'::jsonb,
    ADD COLUMN IF NOT EXISTS "paymentBreakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS "cashierId" uuid;

UPDATE "public"."production_sales"
SET "reference" = 'POS-LEGACY-' || substr(replace("id"::text, '-', ''), 1, 27)
WHERE "reference" IS NULL;

UPDATE "public"."production_sales"
SET "idempotencyKey" = 'legacy-' || replace("id"::text, '-', '')
WHERE "idempotencyKey" IS NULL;

UPDATE "public"."production_sales"
SET "requestHash" = lpad(md5("id"::text), 64, '0')
WHERE "requestHash" IS NULL;

UPDATE "public"."production_sales" AS sale
SET "cashierId" = COALESCE(
    (SELECT "id" FROM "public"."users" WHERE "role" = 'cashier' AND "isActive" = true ORDER BY "createdAt" LIMIT 1),
    (SELECT "id" FROM "public"."users" WHERE "role" = 'admin' AND "isActive" = true ORDER BY "createdAt" LIMIT 1)
)
WHERE sale."cashierId" IS NULL;

ALTER TABLE "public"."production_sales"
    ALTER COLUMN "reference" SET NOT NULL,
    ALTER COLUMN "idempotencyKey" SET NOT NULL,
    ALTER COLUMN "requestHash" SET NOT NULL,
    ALTER COLUMN "additionalCharges" SET NOT NULL,
    ALTER COLUMN "paymentBreakdown" SET NOT NULL,
    ALTER COLUMN "cashierId" SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'production_sales_cashierId_fkey'
          AND conrelid = '"public"."production_sales"'::regclass
    ) THEN
        ALTER TABLE "public"."production_sales"
            ADD CONSTRAINT "production_sales_cashierId_fkey"
            FOREIGN KEY ("cashierId") REFERENCES "public"."users" ("id") ON DELETE RESTRICT;
    END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS "production_sales_reference_unique"
    ON "public"."production_sales" ("reference");
CREATE UNIQUE INDEX IF NOT EXISTS "production_sales_idempotency_unique"
    ON "public"."production_sales" ("idempotencyKey");

COMMIT;
