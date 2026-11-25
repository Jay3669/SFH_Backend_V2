BEGIN;

CREATE TABLE IF NOT EXISTS "public"."cash_drawers" (
    "id" uuid PRIMARY KEY,
    "business_date" date NOT NULL,
    "cashier_id" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE RESTRICT,
    "opening_balance" numeric(14,2) NOT NULL,
    "actual_cash" numeric(14,2),
    "expected_cash" numeric(14,2),
    "variance" numeric(14,2),
    "cash_taken" numeric(14,2) NOT NULL DEFAULT 0,
    "status" varchar(16) NOT NULL DEFAULT 'open',
    "opened_at" timestamptz NOT NULL DEFAULT now(),
    "closed_at" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "cash_drawers_cashier_date_idx"
    ON "public"."cash_drawers" ("cashier_id", "business_date");
CREATE INDEX IF NOT EXISTS "cash_drawers_status_opened_idx"
    ON "public"."cash_drawers" ("status", "opened_at");

COMMIT;
