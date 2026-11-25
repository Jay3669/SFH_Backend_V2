# Realistic database seeder

Targets `DB_NAME`/`DB_SCHEMA` from `.env`. It is additive and does not delete or
overwrite existing records. Most seed rows use stable QA names or SKUs and are
safe to rerun.

## Safety

Set:

```powershell
$env:NODE_ENV = "test"
$env:SEED_TEST_DATA_CONFIRM = "I_CONFIRM_NON_PRODUCTION"
npm run seed:realistic
```

The seeder refuses `NODE_ENV=production` and database names that do not contain
`DEV`, `TEST`, `QA`, or `T<number>`. It will also accept only the existing
database configuration in `.env`; the current database is `SFH_T01`.

## Rerun

Rerun the same command. Unique names, emails, SKUs, references, and fixture keys
make the process idempotent. Existing rows are not deleted or replaced.

## Exceptions

Roles, permissions, role-permission assignments, and `application_settings`
are fixed or singleton system data, so they are not generated as 50-row fixtures.
