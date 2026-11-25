BEGIN;

CREATE TABLE IF NOT EXISTS "public"."user_permissions" (
    "id" uuid PRIMARY KEY,
    "userId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "permissionId" varchar(100) NOT NULL REFERENCES "public"."permissions" ("id") ON DELETE CASCADE,
    "granted" boolean NOT NULL DEFAULT true,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("userId", "permissionId")
);

CREATE TABLE IF NOT EXISTS "public"."staff_profiles" (
    "id" uuid PRIMARY KEY,
    "userId" uuid NOT NULL UNIQUE REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "address" text,
    "department" varchar(100),
    "designation" varchar(100),
    "joiningDate" date,
    "salary" numeric(12,2),
    "employmentStatus" varchar(20) NOT NULL DEFAULT 'active',
    "profileImage" text,
    "createdBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."customers" (
    "id" uuid PRIMARY KEY,
    "userId" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "fullName" varchar(200) NOT NULL,
    "email" varchar(254) UNIQUE,
    "phoneNumber" varchar(30) NOT NULL UNIQUE,
    "address" text,
    "dateOfBirth" date,
    "status" varchar(20) NOT NULL DEFAULT 'active',
    "totalPurchases" integer NOT NULL DEFAULT 0,
    "totalSpending" numeric(12,2) NOT NULL DEFAULT 0,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."notifications" (
    "id" uuid PRIMARY KEY,
    "title" varchar(160) NOT NULL,
    "message" text NOT NULL,
    "category" varchar(30) NOT NULL DEFAULT 'general',
    "targetRole" varchar(30),
    "targetUserId" uuid REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "createdBy" uuid REFERENCES "public"."users" ("id") ON DELETE SET NULL,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "public"."notification_recipients" (
    "id" uuid PRIMARY KEY,
    "notificationId" uuid NOT NULL REFERENCES "public"."notifications" ("id") ON DELETE CASCADE,
    "userId" uuid NOT NULL REFERENCES "public"."users" ("id") ON DELETE CASCADE,
    "readAt" timestamptz,
    "createdAt" timestamptz NOT NULL DEFAULT now(),
    "updatedAt" timestamptz NOT NULL DEFAULT now(),
    UNIQUE ("notificationId", "userId")
);

INSERT INTO "public"."permissions" ("id", "description") VALUES
    ('customers:read', 'Read customers'),
    ('customers:create', 'Create customers'),
    ('customers:update', 'Update and deactivate customers'),
    ('notifications:read', 'Read notifications'),
    ('notifications:create', 'Create notifications'),
    ('notifications:update', 'Update or delete notifications')
ON CONFLICT ("id") DO NOTHING;

COMMIT;
