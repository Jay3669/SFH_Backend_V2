BEGIN;

CREATE TABLE IF NOT EXISTS "public"."application_settings" (
    "id" smallint PRIMARY KEY CHECK ("id" = 1),
    "settings" jsonb NOT NULL CHECK (jsonb_typeof("settings") = 'object'),
    "nextInvoiceNumber" bigint NOT NULL CHECK ("nextInvoiceNumber" > 0),
    "updatedBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

INSERT INTO "public"."application_settings" ("id", "settings", "nextInvoiceNumber")
SELECT
    1,
    '{
        "billing": {
            "invoicePrefix": "POS",
            "tax": { "enabled": false, "rate": 0 },
            "packingCharge": { "enabled": false, "amount": 0 },
            "additionalCharges": []
        },
        "payments": {
            "enabledMethods": { "cash": true, "card": true, "upi": true },
            "allowSplit": true
        },
        "regional": {
            "dateFormat": "DD/MM/YYYY",
            "timeFormat": "12h",
            "timeZone": "Asia/Kolkata"
        },
        "profitSharing": {
            "maxAllocationPercentage": 20
        }
    }'::jsonb,
    COALESCE((
        SELECT MAX((regexp_match("reference", '^POS-([0-9]+)$'))[1]::bigint) + 1
        FROM "public"."production_sales"
        WHERE "reference" ~ '^POS-[0-9]+$'
    ), 1)
ON CONFLICT ("id") DO NOTHING;

ALTER TABLE "public"."production_sales"
    ADD COLUMN IF NOT EXISTS "paymentBreakdown" jsonb NOT NULL DEFAULT '{}'::jsonb,
    ADD COLUMN IF NOT EXISTS "additionalCharges" jsonb NOT NULL DEFAULT '[]'::jsonb;

DO $$
DECLARE
    payment_constraint text;
BEGIN
    FOR payment_constraint IN
        SELECT constraint_row.conname
        FROM pg_constraint AS constraint_row
        JOIN pg_class AS relation ON relation.oid = constraint_row.conrelid
        JOIN pg_namespace AS schema ON schema.oid = relation.relnamespace
        WHERE schema.nspname = 'public'
          AND relation.relname = 'production_sales'
          AND constraint_row.contype = 'c'
          AND pg_get_constraintdef(constraint_row.oid) ILIKE '%paymentMethod%'
    LOOP
        EXECUTE format(
            'ALTER TABLE "public"."production_sales" DROP CONSTRAINT %I',
            payment_constraint
        );
    END LOOP;
END $$;

ALTER TABLE "public"."production_sales"
    DROP CONSTRAINT IF EXISTS "production_sales_payment_breakdown_check",
    DROP CONSTRAINT IF EXISTS "production_sales_additional_charges_check";

ALTER TABLE "public"."production_sales"
    ADD CONSTRAINT "production_sales_payment_method_check"
        CHECK ("paymentMethod" IN ('cash', 'upi', 'card', 'split')),
    ADD CONSTRAINT "production_sales_payment_breakdown_check"
        CHECK (jsonb_typeof("paymentBreakdown") = 'object'),
    ADD CONSTRAINT "production_sales_additional_charges_check"
        CHECK (jsonb_typeof("additionalCharges") = 'array');

COMMIT;

-- Rollback (only after no split-payment or additional-charge sales exist):
-- BEGIN;
-- ALTER TABLE "public"."production_sales"
--     DROP CONSTRAINT IF EXISTS "production_sales_payment_method_check",
--     DROP CONSTRAINT IF EXISTS "production_sales_payment_breakdown_check",
--     DROP CONSTRAINT IF EXISTS "production_sales_additional_charges_check";
-- ALTER TABLE "public"."production_sales"
--     ADD CONSTRAINT "production_sales_payment_method_check"
--         CHECK ("paymentMethod" IN ('cash', 'upi', 'card'));
-- ALTER TABLE "public"."production_sales"
--     DROP COLUMN IF EXISTS "paymentBreakdown",
--     DROP COLUMN IF EXISTS "additionalCharges";
-- DROP TABLE IF EXISTS "public"."application_settings";
-- COMMIT;
