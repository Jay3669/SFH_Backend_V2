BEGIN;

DROP INDEX IF EXISTS "public"."users_email";
DROP INDEX IF EXISTS "public"."users_phone_number";

COMMIT;

-- Roll back by recreating the dropped indexes:
-- CREATE UNIQUE INDEX "users_email" ON "public"."users" ("email");
-- CREATE UNIQUE INDEX "users_phone_number" ON "public"."users" ("phoneNumber");
