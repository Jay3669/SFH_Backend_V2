# Authentication and user management

All API paths are prefixed with `/api`. Requests and responses use JSON unless
refreshing a session, which also uses the `sfhRefreshToken` HttpOnly cookie.
Responses have the form `{ statusCode, status, message, data? }`.

## Initial admin and database setup

Configure PostgreSQL with `DATABASE_URL` or `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, and `DB_PASSWORD`. To keep local and production settings in one `.env`,
set `DB_ENV=local` or `DB_ENV=production` and provide profile-specific values:
`LOCAL_DB_HOST`, `LOCAL_DB_PORT`, `LOCAL_DB_NAME`, `LOCAL_DB_SCHEMA`,
`LOCAL_DB_USER`, `LOCAL_DB_PASSWORD`, and `LOCAL_DB_SSL`, or the equivalent
`PRODUCTION_DB_*` variables. The selected profile can instead use
`LOCAL_DATABASE_URL` or `PRODUCTION_DATABASE_URL`. `DB_ENV` defaults to the
legacy `DB_*`/`DATABASE_URL` settings; `DB_ENV=production` also accepts those
legacy names when no production-prefixed settings are supplied.
`DB_SCHEMA` defaults to `public`; migrations run through
`seeders/applyOneMigration.js` are applied to the selected profile's schema. Set
the selected profile's `*_DB_SSL=true` when the database requires TLS. On
Render, set `PRODUCTION_DATABASE_URL` to the PostgreSQL internal connection
URL and set `PRODUCTION_DB_SCHEMA=sfh` if using the `sfh` schema. Production
startup applies pending numbered SQL migrations in order and records them in
`schema_migrations`; automatic Sequelize sync remains reserved for local
development. For an existing database whose migrations were applied before
tracking was introduced, verify that it reflects every migration through
version 023, then initialize its history once with
`npm run migrate:baseline -- 023`. During this baseline, missing menu/cash-drawer
tables are repaired by migrations 006, 007, and 015; other missing schema
changes are not applied. Do not baseline a new or partially migrated database.
`JWT_ACCESS_SECRET` (at least 32 characters;
`JWT_SECRET` is also accepted). Set `JWT_ACCESS_EXPIRES_IN=8h` for an 8-hour
access token; this setting controls JWT signing and the login/refresh response
and defaults to `8h`. `JWT_ACCESS_TTL` is accepted as a compatibility fallback.
Optionally set a distinct `JWT_REFRESH_SECRET`
(at least 32 characters) and `JWT_REFRESH_DAYS` (1-365; default 30). To
initialize an admin, set `ADMIN_FIRST_NAME`, `ADMIN_LAST_NAME`, `ADMIN_EMAIL`,
and `ADMIN_PASSWORD` (6-18 characters), then run:

```sh
npm run seed:admin
```

### Non-production test fixtures

For an explicitly confirmed, disposable test database, add a connected set of
QA users, stock, recipes, and production history. The seed is additive, runs in
a transaction, and refuses to run in production or when this fixture namespace
already exists. It does not create intentionally invalid database rows; use the
API validation endpoints for negative request cases.

In PowerShell:

```powershell
$env:SEED_TEST_DATA_CONFIRM = 'I_CONFIRM_NON_PRODUCTION'
npm run seed:test-data
Remove-Item Env:SEED_TEST_DATA_CONFIRM
```

The command inserts 50 users, 50 stock categories, 53 stock items, 203 stock
movements, 50 menu items, 50 recipes, 50 recipe versions, 50 recipe ingredients,
100 production records, 100 production ingredients, 100 production cost
details, 50 cancellations, and 50 recoveries. It prints a generated QA admin
login for testing the APIs and frontend. Do not run this command against a
production database.

For an existing database, apply `migrations/001_user_registration_identifiers.sql`,
`migrations/002_authentication_user_management.sql`, and
`migrations/003_user_first_last_name.sql` before using the new authentication
endpoints. Migration 003 splits existing `name` values at the first whitespace;
review one-word names after migration. The migration runner applies migrations to `DB_SCHEMA`. Resolve
existing email addresses that differ only by case and phone numbers that differ
only by formatting before applying the unique indexes. Fresh databases receive
their tables from Sequelize sync and the role/permission defaults at startup.

Email verification and password recovery require SMTP configuration:
`SMTP_HOST`, `SMTP_PORT` (defaults to 587), and `EMAIL_FROM`; provide both
`SMTP_USER` and `SMTP_PASSWORD` when authentication is required. Set
`SMTP_SECURE=true` for implicit TLS. Email delivery is optional at registration
time, but verification and recovery require a configured mail service.

## Registration and login

Registration accepts `firstName`, `lastName`, `password`, and at least one of
`email` or `phoneNumber`. Emails are trimmed and lower-cased; phone numbers are
stored as digits. Passwords must be 6-18 characters. Public registration
creates customers only. Creating Admin, Manager, Employee, or legacy Cashier
accounts requires an authenticated Admin.

Login accepts `identifier` (email or phone number), or `email` / `phoneNumber`,
and `password`. A successful response contains the sanitized user, role,
permissions, and access token. The refresh token is only set in an HttpOnly
cookie, and is rotated on refresh. Send the access token as
`Authorization: Bearer <accessToken>`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/register` | Public customer; Admin for privileged roles | Unified registration |
| POST | `/api/auth/customer/register` | Public | Legacy customer registration |
| POST | `/api/auth/login` | Public | Login for any role |
| POST | `/api/auth/customer/login` | Public | Customer-only login |
| POST | `/api/auth/admin/login` | Public | Admin-only login |
| POST | `/api/auth/staff/login` | Public | Manager, Cashier, or Employee login |
| POST | `/api/auth/refresh` | Refresh cookie or request token | Rotate refresh token |
| POST | `/api/auth/logout` | Same-origin; refresh cookie or signed access token | Revoke this session and clear refresh cookie |
| POST | `/api/auth/logout-all` | Authenticated | Revoke all sessions |
| GET | `/api/auth/me` | Authenticated | Get current user and permissions |
| PATCH / PUT | `/api/auth/profile` | Authenticated | Update firstName, lastName, email, or phone |
| POST | `/api/auth/change-password` | Authenticated | Change password and revoke sessions |
| POST | `/api/auth/forgot-password` | Public | Email a one-time reset code |
| POST | `/api/auth/verify-reset-token` | Public | Verify reset code |
| POST | `/api/auth/reset-password` | Public | Reset password with verified code |
| POST | `/api/auth/verify-email` | Public | Verify email using emailed token |
| POST | `/api/auth/resend-email-verification` | Authenticated | Resend verification email |

Phone OTP sign-in is not enabled, so there is no phone-verification endpoint.
Account status must be `active` to authenticate; inactive and blocked accounts
are rejected.

## Stock management

Stock routes require an Admin bearer access token. Apply
`migrations/004_stock_management.sql` and then
`migrations/005_stock_categories_and_cost_history.sql` before deploying. Existing databases
that were created without the stock-item `sku` column should also apply
`migrations/013_stock_item_sku.sql`. Items are archived
instead of deleted so movement history remains available. Quantities support
up to three decimal places; costs support up to two.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/admin/stock/summary` | Active item, low-stock, out-of-stock, daily-usage, and stock-value totals |
| GET / POST | `/api/admin/stock/categories` | List or create categories |
| GET / PATCH / DELETE | `/api/admin/stock/categories/:categoryId` | Read, update, or delete an unused category |
| GET / POST | `/api/admin/stock/items` | Search/paginate items or create an item |
| GET / PATCH / DELETE | `/api/admin/stock/items/:itemId` | Read, update, or archive an item |
| PATCH | `/api/admin/stock/items/:itemId/restore` | Restore an archived item |
| POST | `/api/admin/stock/items/:itemId/movements` | Receive (`in`), issue (`out`), or count (`count`) stock |
| GET | `/api/admin/stock/movements` | Paginated stock movement history |

Apply `migrations/021_stock_category_code.sql` after the other stock migrations.
Stock category codes are generated by PostgreSQL in the `CAT-000001` format and
returned as `categoryCode` by category create, list, and get responses. They are
server-managed and must not be sent in create or update requests.

Apply `migrations/022_stock_item_fields.sql` after the stock category migrations.
Stock item codes are generated as `ITM-000001` and returned as `itemCode`;
`imageUrl`, `expiryDate`, and `displayOrder` can be set when creating or updating
stock items. Items are listed by display order, then name.

Apply `migrations/023_stock_category_ordering.sql` to enforce positive unique
category display orders. When omitted on create, the service assigns the lowest
available positive order; explicit positions are preserved and conflicts are
shifted transactionally. Updates shift affected categories, and deletion
compacts the remaining category orders.

Create categories before assigning items. Category names are unique without
regard to case, and categories with assigned items cannot be deleted. Item
creation sets its weighted-average unit cost to zero; cost is computed from
receipts, not edited directly.

Movement requests use
`{ "type": "in", "quantity": 1, "unitCost": 64.5, "reason": "Supplier delivery" }`
for receipts. `unitCost` is the purchase price per unit and is required for
`in` movements. Issue and count requests use `type`, `quantity`, and `reason`;
for `count`, `quantity` is the new counted balance. Stock cannot be issued
below zero, and every movement records the before/after balance and acting
user. The current stock value uses on-hand quantity multiplied by weighted
average cost. Daily usage counts distinct items issued today and reports each
item's total issued quantity; the business day uses `STOCK_TIME_ZONE`, defaulting
to `Asia/Kolkata`.

## Recipes and daily production

Apply `migrations/006_recipe_production.sql` after the stock migrations, then
`migrations/007_menu_categories.sql` to create menu categories and associate
existing menu items, `migrations/008_menu_item_price.sql` to add menu-item
pricing, and `migrations/009_daily_production_pos.sql` to enable daily
availability, POS sales, closing, and expenses. Apply
`migrations/010_drop_duplicate_user_indexes.sql` to remove duplicate
non-constraint indexes on user email and phone while retaining their unique
constraints. Apply `migrations/011_application_settings_and_split_payments.sql`
to initialize shared billing settings, sequential invoice numbering,
configurable charges, and split-payment snapshots. Migration 024 adds generated
menu category/item codes and menu item display ordering. The production startup
runner applies it automatically once earlier migrations are present in
`schema_migrations`; `npm run migrate:menu` remains
available for explicit, tracked application of migrations 006, 007, and 024.
Migration 025 adds nullable menu-category `imageUrl` support; production startup
applies it automatically after the previously recorded migrations.
Migration 026 repairs a missing `menu_items.price` column and its nonnegative
constraint; production startup applies it automatically as a forward fix.
For local development, use `npm run dev`, which watches `src` and `migrations`
and restarts the server when files change. Production
permissions are seeded at startup: Admins and Managers can maintain production,
close days, record expenses and read reports; Cashiers can read POS availability
and complete cashier-confirmed bills; Employees can read recipes, preview and
confirm production, update actual yield and read daily availability. All
endpoints require a bearer access token and the permission listed below.

| Method | Path | Permission | Purpose |
| --- | --- | --- | --- |
| GET / POST | `/api/admin/production/menu-categories` | `menu:read` / `menu:create` | Search, filter, sort, paginate, or create menu categories |
| GET / PUT / PATCH / DELETE | `/api/admin/production/menu-categories/:categoryId` | `menu:read` / `menu:update` | Read, update, or delete/deactivate a category |
| GET / POST | `/api/admin/production/menu-items` | `menu:read` / `menu:create` | List or create menu items |
| PATCH | `/api/admin/production/menu-items/:menuItemId` | `menu:update` | Update or activate/deactivate a menu item |
| GET | `/api/admin/production/stock-items` | `recipes:read` | List active stock items for recipe mapping |
| GET / POST | `/api/admin/production/recipes` | `recipes:read` / `recipes:create` | List or create recipes and their first version |
| GET | `/api/admin/production/recipes/:recipeId` | `recipes:read` | Read a recipe and its current version |
| POST | `/api/admin/production/recipes/:recipeId/versions` | `recipes:update` | Add a new immutable version |
| PATCH | `/api/admin/production/recipes/:recipeId/archive` | `recipes:archive` | Archive or restore a recipe (`isArchived` boolean) |
| POST | `/api/admin/production/preview` | `production:preview` | Preview scaled ingredients, availability, yield, and cost |
| GET / POST | `/api/admin/production/records` | `production:read` / `production:create` | List records or confirm a batch |
| GET | `/api/admin/production/records/:productionId` | `production:read` | Read a production record and ingredient snapshots |
| PATCH | `/api/admin/production/records/:productionId/yield` | `production:update` | Record actual plate yield |
| POST | `/api/admin/production/records/:productionId/cancel` | `production:cancel` | Cancel a batch and optionally recover unused ingredients |
| GET | `/api/admin/production/reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | `production:reports:read` | Summarize production, menu item cost, and ingredient use |
| GET | `/api/admin/production/availability?productionDate=YYYY-MM-DD` | `production:pos:read` | Read date-specific produced, sold, and available plate counts |
| POST | `/api/admin/production/sales` | `production:pos:checkout` | Complete an idempotent cash/UPI/card/split sale against available plates |
| POST | `/api/admin/production/close` | `production:close` | Close a production date and persist unsold plates and wastage cost |
| GET | `/api/admin/production/financial-reports?from=YYYY-MM-DD&to=YYYY-MM-DD` | `production:reports:read` | Production, sales, wastage, payment, expenses, gross/net profit and loss |
| GET / POST | `/api/admin/production/expenses` | `production:reports:read` / `production:expenses:manage` | List or record rent, utilities, salaries, gas, maintenance and other expenses |
| GET | `/api/admin/settings` | `production:pos:read` | Read shared billing, payment, and regional settings |
| PUT | `/api/admin/settings` | Admin | Update shared billing, payment, and regional settings |

Menu categories are ordered by `display_order` ascending by default. List queries
accept `page`, `limit` (1-100), `q`, `status=all|active|inactive`,
`sort=displayOrder|name|createdAt`, and `order=asc|desc`. Category names are
unique without regard to case. If `displayOrder` is omitted on create, PostgreSQL
assigns the next order value. Updating a category name also updates the
denormalized menu-item category labels. Deleting a category with linked menu
items deactivates it and returns the associated-item count; an unused category
is deleted.

Create a category:

```json
{
  "name": "Breakfast",
  "description": "Morning dishes"
}
```

Successful create response:

```json
{
  "statusCode": 201,
  "status": "CREATED",
  "message": "Menu category created.",
  "data": {
    "id": "f86b4b4c-d96d-497c-8d3f-8fd5d8a2145a",
    "name": "Breakfast",
    "description": "Morning dishes",
    "displayOrder": 6,
    "isActive": true,
    "menuItemCount": 0
  }
}
```

For partial updates, send only changed fields. Menu-item creation accepts either
`categoryId` or the legacy `category` name; new clients should use `categoryId`.
Menu-item `price` is a non-negative number with at most two decimal places. It
defaults to zero for existing clients that omit it; the admin form supplies it.
The machine-readable OpenAPI contract is in [openapi.yaml](./openapi.yaml).

Confirm production with the same fields as the preview plus a unique
`idempotencyKey` (8-100 characters), optional `actualPlateCount`, `notes`, and
`additionalCosts: [{ "name": "Fuel", "amount": 12.5 }]`. Repeating the same key
and data returns the original record; reusing it for different data returns
409. New records snapshot the current menu selling price. Confirmation locks the
production date and stock rows, checks availability, deducts all ingredients,
and records stock movements and weighted-average cost snapshots in one database
transaction. Quantities use up to three decimals and monetary values use two.
Units convert only within a known mass, volume, or count dimension; unsupported
unit combinations are rejected rather than silently mixed. Cost per kilogram is
null for non-mass production units.

The POS accepts `{ "productionDate": "2026-11-20", "idempotencyKey":
"checkout-unique-01", "paymentMethod": "upi", "items": [{ "menuItemId":
"uuid", "quantity": 2 }], "discountAmount": 0 }`. A split payment uses
`"paymentMethod": "split"` and a `paymentBreakdown` object containing exactly
two distinct enabled tender types and positive amounts, for example
`{ "cash": 30, "card": 70 }`. The tender amounts must equal the final bill total.
Quantities are whole plates. The server prices items from the current menu price,
validates availability under a transaction lock, allocates the bill to production
batches, and stores historical sale price and cost snapshots. Discount is
allocated proportionally across bill lines; enabled tax is calculated on the
discounted item subtotal, and enabled packing and additional charges are added
from shared settings. Each completed bill receives a sequential reference using
the configured invoice prefix. Settings and invoice-number allocation are locked
inside the checkout transaction. Legacy `taxRate` and `packingCharge` fields may
still be sent, but must match the configured values; new clients should omit
them. The checkout is cashier-confirmed: no UPI/card gateway is configured in
this project. A successful confirmation creates a completed bill and deducts
plates once; a failed request creates no bill and deducts no plates. Retrying an
identical request with the same idempotency key returns its original receipt.

Application settings are shared across registers. Only Admins can update them;
users with POS read permission can read them. Billing settings support a prefix,
sequential bill number, independently enabled tax and packing fees, and up to
ten optional fixed or percentage charges. At least one tender must remain
enabled, and split payments can only use two enabled tenders. Date formats,
12/24-hour time, and an IANA time-zone identifier are stored with the settings.

Closing a date locks the same production-day row used by checkout and production
confirmation. It snapshots per-menu produced/sold/wasted plates, production
cost, net item sales and wastage cost, then makes all remaining plates
unavailable. The gross profit calculation is sales revenue less the complete
production cost; wastage is already inside production cost and is not subtracted
again. Operating expenses affect net profit only. New production, yield edits,
cancellations and checkout are rejected after a date is closed. Yield edits and
batch cancellation are also rejected once that batch has sold plates.

Financial reports accept date ranges up to ten years and the optional filters
`categoryId`, `menuItemId`, `paymentMethod=cash|upi|card|all`, and
`paymentStatus=completed|failed|cancelled|all`. The API returns payment summaries
and item/day-level production, sales and wastage. Reports expose CSV for
spreadsheet use; the admin UI can print or save a PDF from the browser. The
admin UI provides daily, weekly, monthly, quarterly, half-yearly and yearly
shortcuts.

To cancel, send a required `reason` and only list the ingredient quantities that
are genuinely unused and safe to return:

```json
{
  "reason": "Batch cancelled before service",
  "recoveries": [
    { "productionIngredientId": "uuid-from-production-detail", "quantityRecovered": 0.25 }
  ]
}
```

Recovered quantities cannot exceed the amount originally issued and are written
as separate stock-in movements at the original consumed cost. Ingredients not
listed remain consumed/wasted. Production-only reports support `format=csv`.

## Admin user management

All routes below require a bearer access token, the Admin role, and the matching
permission.

| Method | Path | Request | Purpose |
| --- | --- | --- | --- |
| POST | `/api/admin/users` | Registration fields plus `role` | Create Admin or any staff/customer account |
| POST | `/api/admin/staff` | Registration fields plus `role` | Create Manager, Cashier, or Employee |
| GET | `/api/admin/staff` | — | List staff accounts |
| GET | `/api/admin/staff/:userId` | — | Get one staff profile |
| PATCH | `/api/admin/staff/:userId` | Staff and employment profile fields | Update staff account |
| DELETE | `/api/admin/staff/:userId` | — | Deactivate staff account |

Roles and permissions are stored in `roles`, `permissions`, and
`role_permissions`. The default permissions are seeded at startup. The
`authenticateToken`, `authorizeRole`, and `authorizePermission` middleware
exports can be used to protect additional routes.

## cURL examples

Windows PowerShell `curl.exe` examples for every endpoint are maintained in
[apiCurls.md](./apiCurls.md).

## Operational notes

Login, registration, refresh, reset, and verification routes have in-process
rate limits. In a multi-instance deployment, configure a shared rate-limit
store before scaling out. Cookies default to `SameSite=Strict`; set
`AUTH_COOKIE_SAME_SITE=none` when a cross-site frontend must send cookies, and
configure `ENABLE_CORS=true` with exact allowed origins. `SameSite=None` always
requires HTTPS.

The service writes important authentication events to `auth_audit_logs`.
Refresh sessions and password-reset / email-verification challenges are
persisted in PostgreSQL; passwords and challenge codes are never stored in
plaintext.
