BEGIN;

CREATE TABLE IF NOT EXISTS "public"."branches" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "name" varchar(120) NOT NULL,
    "code" varchar(20) NOT NULL,
    "address" varchar(500),
    "phone" varchar(30),
    "email" varchar(254),
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "branches_code_unique"
    ON "public"."branches" ("code");
CREATE UNIQUE INDEX IF NOT EXISTS "branches_name_lower_unique"
    ON "public"."branches" (LOWER("name"));

INSERT INTO "public"."branches" ("name", "code")
VALUES ('Main Branch', 'MAIN')
ON CONFLICT ("code") DO NOTHING;

DO $$
DECLARE
    table_name text;
    default_branch_id uuid;
    constraint_name text;
BEGIN
    SELECT "id" INTO default_branch_id
    FROM "public"."branches"
    WHERE "code" = 'MAIN';

    FOREACH table_name IN ARRAY ARRAY[
        'stock_categories',
        'stock_items',
        'stock_movements',
        'menu_categories',
        'menu_items',
        'recipes',
        'recipe_versions',
        'recipe_ingredients',
        'production_records',
        'production_ingredients',
        'production_cost_details',
        'production_cancellations',
        'production_recoveries',
        'production_days',
        'production_day_items',
        'production_sales',
        'production_sale_items',
        'operating_expenses',
        'staff_profiles',
        'staff_role_assignments',
        'profit_share_calculations',
        'profit_share_calculation_details',
        'profit_share_approvals',
        'profit_share_adjustments',
        'profit_share_payments',
        'profit_share_payment_details',
        'staff_activity_logs'
    ] LOOP
        IF to_regclass(format('%I.%I', 'public', table_name)) IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS branch_id uuid',
                'public', table_name
            );
            EXECUTE format(
                'UPDATE %I.%I SET branch_id = $1 WHERE branch_id IS NULL',
                'public', table_name
            ) USING default_branch_id;
            EXECUTE format(
                'ALTER TABLE %I.%I ALTER COLUMN branch_id SET NOT NULL',
                'public', table_name
            );

            constraint_name := table_name || '_branch_id_fkey';
            IF NOT EXISTS (
                SELECT 1
                FROM pg_constraint
                WHERE conname = constraint_name
                  AND conrelid = to_regclass(format('%I.%I', 'public', table_name))
            ) THEN
                EXECUTE format(
                    'ALTER TABLE %I.%I ADD CONSTRAINT %I FOREIGN KEY (branch_id) REFERENCES %I.branches(id) ON DELETE RESTRICT',
                    'public', table_name, constraint_name, 'public'
                );
            END IF;
            EXECUTE format(
                'CREATE INDEX IF NOT EXISTS %I ON %I.%I (branch_id)',
                table_name || '_branch_id_idx', 'public', table_name
            );
        END IF;
    END LOOP;
END
$$;

ALTER TABLE "public"."users"
    ADD COLUMN IF NOT EXISTS "branch_id" uuid;

UPDATE "public"."users"
SET "branch_id" = (SELECT "id" FROM "public"."branches" WHERE "code" = 'MAIN')
WHERE "branch_id" IS NULL
  AND "role" NOT IN ('admin', 'customer');

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'users_branch_id_fkey'
          AND conrelid = '"public"."users"'::regclass
    ) THEN
        ALTER TABLE "public"."users"
            ADD CONSTRAINT "users_branch_id_fkey"
            FOREIGN KEY ("branch_id")
            REFERENCES "public"."branches" ("id")
            ON DELETE RESTRICT;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "users_branch_id_idx"
    ON "public"."users" ("branch_id");

DROP INDEX IF EXISTS "public"."stock_items_sku_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "stock_items_branch_sku_unique"
    ON "public"."stock_items" ("branch_id", "sku")
    WHERE "sku" IS NOT NULL;

DO $$
DECLARE
    unique_index record;
BEGIN
    FOR unique_index IN
        SELECT index_relation.relname AS index_name,
               constraint_row.conname AS constraint_name
        FROM pg_index index_row
        JOIN pg_class table_relation ON table_relation.oid = index_row.indrelid
        JOIN pg_namespace table_schema ON table_schema.oid = table_relation.relnamespace
        JOIN pg_class index_relation ON index_relation.oid = index_row.indexrelid
        LEFT JOIN pg_constraint constraint_row ON constraint_row.conindid = index_row.indexrelid
        WHERE table_schema.nspname = 'public'
          AND table_relation.relname = 'staff_profiles'
          AND index_row.indisunique
          AND index_row.indnkeyatts = 1
          AND pg_get_indexdef(index_row.indexrelid) LIKE '%("employeeId")%'
    LOOP
        IF unique_index.constraint_name IS NOT NULL THEN
            EXECUTE format(
                'ALTER TABLE %I.%I DROP CONSTRAINT %I',
                'public', 'staff_profiles', unique_index.constraint_name
            );
        ELSE
            EXECUTE format(
                'DROP INDEX %I.%I',
                'public', unique_index.index_name
            );
        END IF;
    END LOOP;
END
$$;
CREATE UNIQUE INDEX IF NOT EXISTS "staff_profiles_branch_employee_id_unique"
    ON "public"."staff_profiles" ("branch_id", "employeeId")
    WHERE "employeeId" IS NOT NULL;

DROP INDEX IF EXISTS "public"."menu_categories_name_lower_unique";
CREATE UNIQUE INDEX IF NOT EXISTS "menu_categories_branch_name_lower_unique"
    ON "public"."menu_categories" ("branch_id", LOWER("name"));

DO $$
DECLARE
    foreign_key_name text;
BEGIN
    FOR foreign_key_name IN
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = '"public"."production_sales"'::regclass
          AND confrelid = '"public"."production_days"'::regclass
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            'public', 'production_sales', foreign_key_name
        );
    END LOOP;
END
$$;

DO $$
DECLARE
    foreign_key_name text;
BEGIN
    FOR foreign_key_name IN
        SELECT conname
        FROM pg_constraint
        WHERE contype = 'f'
          AND conrelid = '"public"."production_day_items"'::regclass
          AND confrelid = '"public"."production_days"'::regclass
    LOOP
        EXECUTE format(
            'ALTER TABLE %I.%I DROP CONSTRAINT %I',
            'public', 'production_day_items', foreign_key_name
        );
    END LOOP;
END
$$;

ALTER TABLE "public"."production_days"
    DROP CONSTRAINT IF EXISTS "production_days_pkey";
ALTER TABLE "public"."production_days"
    ADD CONSTRAINT "production_days_pkey"
    PRIMARY KEY ("branch_id", "productionDate");

ALTER TABLE "public"."production_sales"
    ADD CONSTRAINT "production_sales_branch_date_fkey"
    FOREIGN KEY ("branch_id", "productionDate")
    REFERENCES "public"."production_days" ("branch_id", "productionDate")
    ON DELETE RESTRICT;

ALTER TABLE "public"."production_day_items"
    ADD CONSTRAINT "production_day_items_branch_date_fkey"
    FOREIGN KEY ("branch_id", "productionDate")
    REFERENCES "public"."production_days" ("branch_id", "productionDate")
    ON DELETE RESTRICT;

COMMIT;
