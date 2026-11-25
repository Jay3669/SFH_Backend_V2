BEGIN;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_users_status' AND n.nspname = 'public'
    ) THEN
        CREATE TYPE "enum_users_status" AS ENUM ('active', 'inactive', 'blocked');
    END IF;
END
$$;

ALTER TABLE "public"."users"
    ADD COLUMN IF NOT EXISTS "status" "enum_users_status" NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS "emailVerifiedAt" timestamptz,
    ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS "users_email_lower_unique"
    ON "public"."users" (lower("email"))
    WHERE "email" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "users_status_idx" ON "public"."users" ("status");

CREATE TABLE IF NOT EXISTS "public"."roles" (
    "id" varchar(30) PRIMARY KEY,
    "name" varchar(60) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."permissions" (
    "id" varchar(100) PRIMARY KEY,
    "description" varchar(255) NOT NULL
);

CREATE TABLE IF NOT EXISTS "public"."role_permissions" (
    "roleId" varchar(30) NOT NULL REFERENCES "public"."roles" ("id") ON DELETE CASCADE,
    "permissionId" varchar(100) NOT NULL REFERENCES "public"."permissions" ("id") ON DELETE CASCADE,
    PRIMARY KEY ("roleId", "permissionId")
);

CREATE TABLE IF NOT EXISTS "public"."auth_sessions" (
    "id" uuid PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "refreshTokenHash" char(64) NOT NULL UNIQUE,
    "expiresAt" timestamptz NOT NULL,
    "revokedAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_sessions_user_id_idx" ON "public"."auth_sessions" ("userId");

CREATE TABLE IF NOT EXISTS "public"."password_reset_tokens" (
    "id" uuid PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "tokenHash" char(64) NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "verifiedAt" timestamptz,
    "consumedAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "password_reset_tokens_user_id_idx"
    ON "public"."password_reset_tokens" ("userId");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE t.typname = 'enum_verification_tokens_channel' AND n.nspname = 'public'
    ) THEN
        CREATE TYPE "enum_verification_tokens_channel" AS ENUM ('email', 'phone');
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS "public"."verification_tokens" (
    "id" uuid PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "channel" "enum_verification_tokens_channel" NOT NULL,
    "tokenHash" char(64) NOT NULL,
    "expiresAt" timestamptz NOT NULL,
    "consumedAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "verification_tokens_user_channel_idx"
    ON "public"."verification_tokens" ("userId", "channel");

CREATE TABLE IF NOT EXISTS "public"."auth_audit_logs" (
    "id" uuid PRIMARY KEY,
    "actorUserId" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "action" varchar(80) NOT NULL,
    "subjectUserId" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "ipAddress" varchar(64),
    "details" jsonb NOT NULL DEFAULT '{}'::jsonb,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "auth_audit_logs_actor_created_idx"
    ON "public"."auth_audit_logs" ("actorUserId", "createdAt");

INSERT INTO "public"."roles" ("id", "name") VALUES
    ('admin', 'Admin'), ('manager', 'Manager'), ('cashier', 'Cashier'),
    ('employee', 'Employee'), ('customer', 'Customer')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."permissions" ("id", "description") VALUES
    ('profile:read', 'Read own profile'),
    ('profile:update', 'Update own profile'),
    ('users:read', 'Read user accounts'),
    ('users:create', 'Create user accounts'),
    ('users:update', 'Update user accounts'),
    ('sessions:revoke', 'Revoke user sessions'),
    ('team:read', 'Read staff accounts')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."role_permissions" ("roleId", "permissionId")
SELECT role_id, permission_id
FROM (VALUES
    ('admin', 'profile:read'), ('admin', 'profile:update'), ('admin', 'users:read'),
    ('admin', 'users:create'), ('admin', 'users:update'), ('admin', 'sessions:revoke'),
    ('admin', 'team:read'),
    ('manager', 'profile:read'), ('manager', 'profile:update'), ('manager', 'team:read'),
    ('cashier', 'profile:read'), ('cashier', 'profile:update'),
    ('employee', 'profile:read'), ('employee', 'profile:update'),
    ('customer', 'profile:read'), ('customer', 'profile:update')
) AS defaults(role_id, permission_id)
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;