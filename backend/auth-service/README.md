# Auth Service

An Express 5 authentication API backed by MongoDB. It supports local email/password
authentication, rotating access and refresh sessions, email OTP flows, Google and
Facebook OAuth, user profile management, and admin user management.

## Requirements

- Node.js 18 or newer
- MongoDB
- Redis for distributed rate limiting, cached identities, refresh-session state,
  OTP storage, and OAuth state (the service has local/MongoDB fallbacks when Redis
  is unavailable)
- An SMTP/Resend email configuration for verification and password recovery
- Google/Facebook OAuth credentials when those routes are enabled

## Quick Start

```bash
npm install
cp .env.example .env # if an example file is available, otherwise create .env manually
npm test
npm start
```

The API starts on `http://localhost:3001` by default. Check it with:

```bash
curl http://localhost:3001/health
```

Google OAuth profile images are stored as HTTPS URLs hosted on
`googleusercontent.com`. The safe `profilePicture` field is returned by the
existing login, session, and current-user responses; no separate image route is
required.

For copy-paste requests covering every endpoint, see
[MANUAL_ROUTE_TESTING.md](MANUAL_ROUTE_TESTING.md).

## Environment Variables

At minimum, configure:

```env
PORT=3001
MONGO_URI=mongodb://localhost:27017/auth_service
REDIS_URL=redis://localhost:6379
JWT_SECRET_KEY=replace-with-a-long-random-secret
```

Recommended token configuration:

```env
JWT_ACCESS_SECRET=replace-with-a-different-access-secret
JWT_REFRESH_SECRET=replace-with-a-different-refresh-secret
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=90d
```

For every environment, configure either a strong `JWT_SECRET_KEY` or both
`JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`. Each configured signing secret
must be at least 32 bytes and must not be a placeholder. The sample values
above are not usable secrets. The service fails closed when these requirements
are not met.

Application and cookie settings:

```env
NODE_ENV=development
FRONTEND_URL=http://localhost:3000
CORS_ORIGIN=http://localhost:3000
COOKIE_SAMESITE=lax
COOKIE_SECURE=false
```

Email settings can use Resend or the configured email provider:

```env
RESEND_API_KEY=your-resend-api-key
MAIL_FROM=no-reply@example.com
```

OAuth settings:

```env
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_CALLBACK_URL=http://localhost:8080/api/auth/google/callback
FACEBOOK_APP_ID=your-facebook-app-id
FACEBOOK_APP_SECRET=your-facebook-app-secret
FACEBOOK_CALLBACK_URL=http://localhost:3001/api/auth/facebook/callback
```

Never commit `.env` files, credentials, or API keys.

## Authentication Model

Successful login and OAuth callbacks set two HTTP-only cookies:

- `access_token`: short-lived token used by protected requests
- `refresh_token`: long-lived rotating session token used by `/refresh`

The existing website cookies retain their configured SameSite policy. For the
browser extension, auth responses also issue HTTP-only `Secure`,
`SameSite=None` companion cookies scoped only to `/api/auth/me` and
`/api/auth/refresh`. These allow the extension background to check and refresh
the same server-managed session without exposing token values to extension UI.
Logout clears both cookie sets.

Protected routes accept the access cookie or an authorization header:

```http
Authorization: Bearer <access-token>
```

MongoDB remains the permanent source of truth for users and refresh sessions.
Redis keeps short-lived session-state markers, caches safe user identity fields,
stores hashed OTPs with expiration, holds OAuth state, and coordinates the
authentication rate limits. Redis keys expire automatically. When Redis is
temporarily unavailable, authentication falls back to MongoDB and rate limiting
uses per-process memory (so rate limits are no longer distributed until Redis
recovers).

## API Routes

The service mounts authentication routes under `/api/auth`.

### Public routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/health` | Service health check |
| POST | `/api/auth/register` | Create a local account and send verification OTP |
| POST | `/api/auth/login` | Authenticate and issue cookies |
| POST | `/api/auth/refresh` | Rotate the refresh session |
| POST | `/api/auth/logout` | Revoke the refresh session and clear cookies |
| GET, POST | `/api/auth/verify-email` | Verify an email OTP |
| POST | `/api/auth/forgot-password` | Send a password-reset OTP |
| POST | `/api/auth/resend-otp` | Resend a verification or reset OTP |
| POST | `/api/auth/reset-password` | Set a new password using an OTP |
| GET | `/api/auth/google` | Start Google OAuth |
| GET | `/api/auth/google/callback` | Complete Google OAuth |
| GET | `/api/auth/facebook` | Start Facebook OAuth |
| GET | `/api/auth/facebook/callback` | Complete Facebook OAuth |

### Authenticated routes

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/session` | Return the current user |
| GET | `/api/auth/me` | Return the current user |
| PUT | `/api/auth/profile` | Update username and/or email |
| PUT | `/api/auth/change-password` | Change the current password |
| DELETE | `/api/auth/account` | Delete the current account |

### Admin routes

Admin routes require a valid access token with role `admin`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/auth/admin/users` | List users with pagination and search; accepts comma-separated `ids` (up to 100) to look up specific users |
| GET | `/api/auth/admin/users/:id` | Get one user |
| PUT | `/api/auth/admin/users/:id` | Update user fields or role |
| DELETE | `/api/auth/admin/users/:id` | Delete another user |

## Validation

- Emails are trimmed and lowercased.
- Passwords must contain at least 8 characters.
- Usernames must contain 3 to 30 characters.
- OTP values must be exactly 6 digits.
- Profile and admin update bodies reject unknown fields.
- Admin roles are `user`, `admin`, or `business`.

Errors use this shape:

```json
{
  "success": false,
  "message": "Request validation failed",
  "errors": []
}
```

## Project Structure

```text
server.js                 Express app and startup
config/                   Database, Passport, and environment configuration
controllers/              HTTP handlers and authentication exports
middleware/               Auth, rate limiting, and error handling
models/                   MongoDB user model
routes/                   Express route definitions
service/                  Authentication and session operations
utils/                    Token, password, cookie, OTP, and email helpers
validation/               Zod request schemas
test/                     Node test runner smoke tests
```

## Commands

```bash
npm install   # Install dependencies
npm test      # Run the Node smoke tests
npm start     # Start the production-style server
npm run dev   # Start with nodemon
```

## Security Notes

- Use separate, strong JWT secrets in production.
- Set `COOKIE_SECURE=true` when serving over HTTPS.
- Restrict `CORS_ORIGIN` to trusted frontend origins.
- Keep OAuth, database, email, and JWT credentials outside source control.
- Do not expose password hashes, OTP values, or refresh tokens in API responses.
- Use a private, authenticated Redis endpoint in production. Redis contains only
  short-lived hashes/state and public identity-cache fields, never passwords or
  permanent user records.
