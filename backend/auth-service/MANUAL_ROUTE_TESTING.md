# Auth Service Manual Route Testing

Use this file to test the API manually with `curl`.

## Setup

Start the service:

```bash
npm start
```

Default base URL:

```bash
export BASE_URL=http://localhost:3001
export API="$BASE_URL/api/auth"
export EMAIL="manual-test-$(date +%s)@example.com"
export USERNAME="manualuser$(date +%s)"
export PASSWORD='Password123!'
export NEW_PASSWORD='NewPassword123!'
export COOKIES=/tmp/auth-service-cookies.txt
```

The service uses these HTTP-only cookies:

- `access_token`: short-lived access token
- `refresh_token`: refresh-session token

The `-c` and `-b` options below save and reuse cookies between requests. Protected
routes also accept `Authorization: Bearer <access-token>`.

## Common Response Shapes

Success:

```json
{
  "success": true,
  "message": "Operation completed successfully."
}
```

Validation or application error:

```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": []
}
```

## 1. Health Check

### `GET /health`

```bash
curl -i "$BASE_URL/health"
```

Expected status: `200`

```json
{
  "success": true,
  "service": "auth-service",
  "status": "ok",
  "environment": "development"
}
```

## 2. Local Authentication

### `POST /api/auth/register`

Request JSON:

```json
{
  "userName": "manualuser123",
  "email": "manual-test@example.com",
  "password": "Password123!"
}
```

```bash
curl -i -X POST "$API/register" \
  -H 'Content-Type: application/json' \
  -d "{\"userName\":\"$USERNAME\",\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

Expected status: `201`

```json
{
  "success": true,
  "message": "Registration successful. Please check your email to verify your account."
}
```

Duplicate email or username: `400`.

### `POST /api/auth/login`

Request JSON:

```json
{
  "email": "manual-test@example.com",
  "password": "Password123!"
}
```

```bash
curl -i -c "$COOKIES" -X POST "$API/login" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"$PASSWORD\"}"
```

Expected status: `200`. The response contains a public `user` object and the
response sets `access_token` and `refresh_token` cookies.

Wrong credentials: `401`.

### `POST /api/auth/refresh`

No JSON body is required. The saved refresh cookie is sent automatically:

```bash
curl -i -b "$COOKIES" -c "$COOKIES" -X POST "$API/refresh"
```

Expected status: `200`. The refresh token is rotated and the cookie file is updated.

Missing, expired, revoked, or already-rotated refresh token: `401`.

### `POST /api/auth/logout`

```bash
curl -i -b "$COOKIES" -c "$COOKIES" -X POST "$API/logout"
```

Expected status: `200`. Both auth cookies are cleared and the refresh session is
revoked. Calling `/refresh` with the old cookie should then return `401`.

## 3. Email Verification and Password Recovery

OTP values are six digits and are sent by email. Use the OTP received for the test
account in the requests below.

```bash
export OTP='123456'
```

### `GET /api/auth/verify-email`

```bash
curl -i --get "$API/verify-email" \
  --data-urlencode "email=$EMAIL" \
  --data-urlencode "otp=$OTP"
```

Expected status: `200` for a valid OTP; invalid or expired OTP: `400`.

### `POST /api/auth/verify-email`

Request JSON:

```json
{
  "email": "manual-test@example.com",
  "otp": "123456"
}
```

```bash
curl -i -X POST "$API/verify-email" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\"}"
```

Expected status: `200`; invalid input or OTP: `400`.

### `POST /api/auth/forgot-password`

Request JSON:

```json
{
  "email": "manual-test@example.com"
}
```

```bash
curl -i -X POST "$API/forgot-password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"
```

Expected status: `200`. An unknown email returns `404`.

### `POST /api/auth/resend-otp`

Request JSON is the same as `forgot-password`:

```bash
curl -i -X POST "$API/resend-otp" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\"}"
```

Expected status: `200`. An unknown email returns `404`.

### `POST /api/auth/reset-password`

Request JSON:

```json
{
  "email": "manual-test@example.com",
  "otp": "123456",
  "newPassword": "NewPassword123!"
}
```

```bash
curl -i -X POST "$API/reset-password" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"otp\":\"$OTP\",\"newPassword\":\"$NEW_PASSWORD\"}"
```

Expected status: `200`; invalid or expired OTP: `400`.

## 4. Authenticated User Routes

Log in first to create `$COOKIES`.

### `GET /api/auth/session`

```bash
curl -i -b "$COOKIES" "$API/session"
```

Expected status: `200` with `{ "success": true, "user": { ... } }`.

### `GET /api/auth/me`

```bash
curl -i -b "$COOKIES" "$API/me"
```

Expected status: `200` with the current public user. Missing or invalid token: `401`.

### `PUT /api/auth/profile`

Request JSON; both fields are optional, and unknown fields are rejected:

```json
{
  "userName": "updatedmanualuser",
  "email": "updated-manual@example.com"
}
```

```bash
curl -i -b "$COOKIES" -X PUT "$API/profile" \
  -H 'Content-Type: application/json' \
  -d '{"userName":"updatedmanualuser"}'
```

Expected status: `200` with the updated public user. Missing/invalid token: `401`.

### `PUT /api/auth/change-password`

Request JSON:

```json
{
  "oldPassword": "Password123!",
  "newPassword": "NewPassword123!"
}
```

```bash
curl -i -b "$COOKIES" -X PUT "$API/change-password" \
  -H 'Content-Type: application/json' \
  -d "{\"oldPassword\":\"$PASSWORD\",\"newPassword\":\"$NEW_PASSWORD\"}"
```

Expected status: `200`. Wrong current password: `400`; missing/invalid token: `401`.

### `DELETE /api/auth/account`

This permanently deletes the currently authenticated account:

```bash
curl -i -b "$COOKIES" -c "$COOKIES" -X DELETE "$API/account"
```

Expected status: `200`; missing/invalid token: `401`.

## 5. OAuth Routes

These routes require configured provider credentials.

### `GET /api/auth/google`

```bash
curl -i "$API/google"
```

Expected behavior: `302` redirect to Google authorization. Complete the provider
login in a browser, not with a fabricated callback request.

### `GET /api/auth/google/callback`

The provider redirects to this route with its own query parameters. A manual shape
looks like this, but `code` must be a real Google authorization code:

```bash
curl -i "$API/google/callback?code=<google-authorization-code>&state=<state-if-used>"
```

Expected behavior: successful OAuth issues auth cookies and redirects to the configured
success URL; failed OAuth redirects to the configured failure URL.

### `GET /api/auth/facebook`

```bash
curl -i "$API/facebook"
```

Expected behavior: `302` redirect to Facebook authorization.

### `GET /api/auth/facebook/callback`

```bash
curl -i "$API/facebook/callback?code=<facebook-authorization-code>&state=<state-if-used>"
```

The `code` must be issued by Facebook. Successful and failed redirects use the
configured OAuth success and failure URLs.

## 6. Admin Routes

These routes require an authenticated user whose role is `admin`. A normal user
receives `403`.

For Bearer-token testing, extract the access token from an API client that exposes
the `Set-Cookie` response header, then set it:

```bash
export ACCESS_TOKEN='<access-token>'
export ADMIN_USER_ID='<admin-user-object-id>'
export TARGET_USER_ID='<another-user-object-id>'
```

Cookie-based examples are shown below. Use an admin cookie jar for admin requests.

### `GET /api/auth/admin/users`

Query parameters are optional: `page`, `limit`, and `search`.

```bash
curl -i -b "$COOKIES" "$API/admin/users?page=1&limit=10&search=manual"
```

Expected status: `200` with `users`, pagination fields, and `totalUsers`.

### `GET /api/auth/admin/users/:id`

```bash
curl -i -b "$COOKIES" "$API/admin/users/$TARGET_USER_ID"
```

Expected status: `200`; invalid MongoDB ID: `400`; missing user: `404`.

### `PUT /api/auth/admin/users/:id`

Request JSON fields are optional:

```json
{
  "userName": "admin-updated-name",
  "email": "admin-updated@example.com",
  "role": "user",
  "isVerified": true
}
```

```bash
curl -i -b "$COOKIES" -X PUT "$API/admin/users/$TARGET_USER_ID" \
  -H 'Content-Type: application/json' \
  -d '{"role":"user","isVerified":true}'
```

Expected status: `200`; invalid ID: `400`; missing user: `404`; duplicate email or
username: `400`.

### `DELETE /api/auth/admin/users/:id`

```bash
curl -i -b "$COOKIES" -X DELETE "$API/admin/users/$TARGET_USER_ID"
```

Expected status: `200`. Invalid ID: `400`; missing user: `404`; deleting the current
admin account: `400`.

## Quick Negative Tests

```bash
# Protected route without authentication: 401
curl -i "$API/me"

# Invalid token: 401
curl -i -H 'Authorization: Bearer invalid-token' "$API/me"

# Invalid registration body: 400
curl -i -X POST "$API/register" \
  -H 'Content-Type: application/json' \
  -d '{"userName":"x","email":"not-an-email","password":"short"}'

# Normal user attempting an admin route: 403
curl -i -b "$COOKIES" "$API/admin/users"
```

## Route Checklist

- [ ] `GET /health`
- [ ] `GET /api/auth/google`
- [ ] `GET /api/auth/google/callback`
- [ ] `GET /api/auth/facebook`
- [ ] `GET /api/auth/facebook/callback`
- [ ] `POST /api/auth/register`
- [ ] `POST /api/auth/login`
- [ ] `POST /api/auth/refresh`
- [ ] `POST /api/auth/logout`
- [ ] `GET /api/auth/verify-email`
- [ ] `POST /api/auth/verify-email`
- [ ] `POST /api/auth/forgot-password`
- [ ] `POST /api/auth/resend-otp`
- [ ] `POST /api/auth/reset-password`
- [ ] `GET /api/auth/session`
- [ ] `GET /api/auth/me`
- [ ] `PUT /api/auth/profile`
- [ ] `PUT /api/auth/change-password`
- [ ] `DELETE /api/auth/account`
- [ ] `GET /api/auth/admin/users`
- [ ] `GET /api/auth/admin/users/:id`
- [ ] `PUT /api/auth/admin/users/:id`
- [ ] `DELETE /api/auth/admin/users/:id`