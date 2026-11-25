# Authentication API cURL examples

These are Windows PowerShell examples. Use `curl.exe` (not PowerShell's `curl`
alias), replace the sample credentials and tokens, and update `$base` if the
server uses a different host or port. Each example is independent; password
changes/resets and logout-all invalidate existing access tokens.

```powershell
$base = 'http://localhost:5000/api'
$adminToken = 'PASTE_ADMIN_ACCESS_TOKEN'
$userToken = 'PASTE_USER_ACCESS_TOKEN'

# Public registration (role defaults to customer)
curl.exe -X POST "$base/auth/register" `
  -H "Content-Type: application/json" `
  --data-raw '{"firstName":"Taylor","lastName":"Customer","email":"taylor@example.com","phoneNumber":"+14155550123","password":"Demo-Pass-123"}'

# Legacy customer registration alias
curl.exe -X POST "$base/auth/customer/register" `
  -H "Content-Type: application/json" `
  --data-raw '{"firstName":"Taylor","lastName":"Customer","email":"taylor@example.com","password":"Demo-Pass-123"}'

# Login with email or phone using the single endpoint; saves refresh cookie
curl.exe -X POST "$base/auth/login" `
  -H "Content-Type: application/json" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt `
  --data-raw '{"identifier":"taylor@example.com","password":"Demo-Pass-123"}'
curl.exe -X POST "$base/auth/login" `
  -H "Content-Type: application/json" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt `
  --data-raw '{"identifier":"+14155550123","password":"Demo-Pass-123"}'

# Role-specific login aliases (the unified endpoint accepts all roles too)
curl.exe -X POST "$base/auth/customer/login" `
  -H "Content-Type: application/json" `
  -c .\customer-cookies.txt -b .\customer-cookies.txt `
  --data-raw '{"identifier":"taylor@example.com","password":"Demo-Pass-123"}'
curl.exe -X POST "$base/auth/admin/login" `
  -H "Content-Type: application/json" `
  -c .\admin-cookies.txt -b .\admin-cookies.txt `
  --data-raw '{"identifier":"admin@example.com","password":"Demo-Pass-123"}'
curl.exe -X POST "$base/auth/staff/login" `
  -H "Content-Type: application/json" `
  -c .\staff-cookies.txt -b .\staff-cookies.txt `
  --data-raw '{"identifier":"manager@example.com","password":"Demo-Pass-123"}'
curl.exe -X POST "$base/auth/staff/login" `
  -H "Content-Type: application/json" `
  -c .\staff-cookies.txt -b .\staff-cookies.txt `
  --data-raw '{"identifier":"employee@example.com","password":"Demo-Pass-123"}'

# Privileged registration through the unified endpoint (Admin token required)
curl.exe -X POST "$base/auth/register" `
  -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"Morgan","lastName":"Manager","email":"morgan@example.com","phoneNumber":"+14155550124","password":"Demo-Pass-123","role":"manager"}'
curl.exe -X POST "$base/auth/register" `
  -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"Avery","lastName":"Employee","email":"avery@example.com","password":"Demo-Pass-123","role":"employee"}'
curl.exe -X POST "$base/auth/register" `
  -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"System","lastName":"Admin","email":"newadmin@example.com","password":"Demo-Pass-123","role":"admin"}'

# Admin user-management aliases
curl.exe -X POST "$base/admin/users" `
  -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"New","lastName":"Employee","email":"newemployee@example.com","password":"Demo-Pass-123","role":"employee"}'
curl.exe -X POST "$base/admin/staff" `
  -H "Authorization: Bearer $adminToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"New","lastName":"Manager","email":"newmanager@example.com","password":"Demo-Pass-123","role":"manager"}'
curl.exe -X GET "$base/admin/staff" -H "Authorization: Bearer $adminToken"

# Refresh rotates the cookie; use the same cookie jar saved at login
curl.exe -X POST "$base/auth/refresh" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt

# Current user and profile updates
curl.exe -X GET "$base/auth/me" -H "Authorization: Bearer $userToken"
curl.exe -X PATCH "$base/auth/profile" `
  -H "Authorization: Bearer $userToken" -H "Content-Type: application/json" `
  --data-raw '{"firstName":"Taylor","lastName":"Updated","phoneNumber":"+14155550125"}'
# PUT is an alias for the same profile update
curl.exe -X PUT "$base/auth/profile" `
  -H "Authorization: Bearer $userToken" -H "Content-Type: application/json" `
  --data-raw '{"lastName":"Updated Again"}'

# Change password
curl.exe -X POST "$base/auth/change-password" `
  -H "Authorization: Bearer $userToken" -H "Content-Type: application/json" `
  --data-raw '{"currentPassword":"Demo-Pass-123","newPassword":"New-Pass-456"}'

# Forgot password -> get code from email -> verify -> reset
curl.exe -X POST "$base/auth/forgot-password" `
  -H "Content-Type: application/json" `
  --data-raw '{"email":"taylor@example.com"}'
curl.exe -X POST "$base/auth/verify-reset-token" `
  -H "Content-Type: application/json" `
  --data-raw '{"email":"taylor@example.com","code":"123456"}'
# Alias for verify-reset-token
curl.exe -X POST "$base/auth/verify-password-reset-token" `
  -H "Content-Type: application/json" `
  --data-raw '{"email":"taylor@example.com","code":"123456"}'
curl.exe -X POST "$base/auth/reset-password" `
  -H "Content-Type: application/json" `
  --data-raw '{"email":"taylor@example.com","code":"123456","password":"New-Pass-456"}'

# Verify email using the token received by email
curl.exe -X POST "$base/auth/verify-email" `
  -H "Content-Type: application/json" `
  --data-raw '{"token":"PASTE_EMAIL_VERIFICATION_TOKEN"}'
curl.exe -X POST "$base/auth/resend-email-verification" `
  -H "Authorization: Bearer $userToken"

# Choose one logout operation; logout-all invalidates the access token too
curl.exe -X POST "$base/auth/logout" -H "Authorization: Bearer $userToken" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt
curl.exe -X POST "$base/auth/logout-all" -H "Authorization: Bearer $userToken" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt
# Alias for logout-all
curl.exe -X POST "$base/auth/logout-all-devices" -H "Authorization: Bearer $userToken" `
  -c .\auth-cookies.txt -b .\auth-cookies.txt
```