BEGIN;

ALTER TABLE "public"."staff_profiles"
    ADD COLUMN IF NOT EXISTS "gender" varchar(20),
    ADD COLUMN IF NOT EXISTS "dateOfBirth" date,
    ADD COLUMN IF NOT EXISTS "alternatePhone" varchar(30),
    ADD COLUMN IF NOT EXISTS "employmentType" varchar(30);

COMMIT;
