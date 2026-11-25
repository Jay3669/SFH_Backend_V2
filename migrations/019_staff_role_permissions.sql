BEGIN;

INSERT INTO "public"."permissions" ("id", "description", "createdAt", "updatedAt") VALUES
    ('staff:view', 'View staff', now(), now()),
    ('staff:create', 'Create staff', now(), now()),
    ('staff:update', 'Update staff', now(), now()),
    ('staff:manage_roles', 'Manage staff role assignments', now(), now()),
    ('profit_share:view', 'View profit sharing', now(), now()),
    ('profit_share:calculate', 'Calculate profit sharing', now(), now()),
    ('profit_share:approve', 'Approve profit sharing', now(), now()),
    ('profit_share:reject', 'Reject profit sharing', now(), now()),
    ('profit_share:adjust', 'Adjust approved profit sharing', now(), now()),
    ('profit_share:payments:view', 'View profit share payments', now(), now()),
    ('profit_share:payments:create', 'Record profit share payments', now(), now()),
    ('profit_share:reports:view', 'View profit share reports', now(), now())
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "public"."role_permissions" ("roleId", "permissionId", "createdAt", "updatedAt") VALUES
    ('admin', 'staff:view', now(), now()),
    ('admin', 'staff:create', now(), now()),
    ('admin', 'staff:update', now(), now()),
    ('admin', 'staff:manage_roles', now(), now()),
    ('admin', 'profit_share:view', now(), now()),
    ('admin', 'profit_share:calculate', now(), now()),
    ('admin', 'profit_share:approve', now(), now()),
    ('admin', 'profit_share:reject', now(), now()),
    ('admin', 'profit_share:adjust', now(), now()),
    ('admin', 'profit_share:payments:view', now(), now()),
    ('admin', 'profit_share:payments:create', now(), now()),
    ('admin', 'profit_share:reports:view', now(), now()),
    ('manager', 'staff:view', now(), now()),
    ('manager', 'profit_share:view', now(), now())
ON CONFLICT ("roleId", "permissionId") DO NOTHING;

COMMIT;
