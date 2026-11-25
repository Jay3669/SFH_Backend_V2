ALTER TABLE "public"."users"
    ALTER COLUMN "email" DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "users_phone_number_digits_unique"
    ON "public"."users" (
        regexp_replace("phoneNumber", '[^0-9]', '', 'g')
    )
    WHERE "phoneNumber" IS NOT NULL
      AND regexp_replace("phoneNumber", '[^0-9]', '', 'g') <> '';
