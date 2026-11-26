BEGIN;

ALTER TABLE "public"."menu_categories"
    ADD COLUMN IF NOT EXISTS "image_url" varchar(2048);

COMMIT;
