BEGIN;

ALTER TABLE "public"."users"
    ADD COLUMN IF NOT EXISTS "firstName" varchar(120),
    ADD COLUMN IF NOT EXISTS "lastName" varchar(120);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'users'
          AND column_name = 'name'
    ) THEN
        UPDATE "public"."users"
        SET "firstName" = COALESCE(
                NULLIF(btrim("firstName"), ''),
                NULLIF(regexp_replace(btrim("name"), '\s.*$', ''), '')
            ),
            "lastName" = COALESCE(
                NULLIF(btrim("lastName"), ''),
                btrim(regexp_replace(btrim("name"), '^\S+\s*', ''))
            )
        WHERE "firstName" IS NULL
           OR btrim("firstName") = ''
           OR "lastName" IS NULL
           OR btrim("lastName") = '';

        ALTER TABLE "public"."users" ALTER COLUMN "name" DROP NOT NULL;
    END IF;
END
$$;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM "public"."users"
        WHERE "firstName" IS NULL OR btrim("firstName") = ''
           OR "lastName" IS NULL
    ) THEN
        RAISE EXCEPTION 'Set firstName and lastName for every user before completing migration 003.';
    END IF;
END
$$;

ALTER TABLE "public"."users"
    ALTER COLUMN "firstName" SET NOT NULL,
    ALTER COLUMN "lastName" SET NOT NULL;

COMMIT;
