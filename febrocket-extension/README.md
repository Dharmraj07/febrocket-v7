# FebRocket browser extension

WXT + React extension with a popup and a Chromium side panel. The background
service worker is the single owner of authentication state. Popup and side
panel connect to it, and it checks the existing FebRocket `GET /api/auth/me`
endpoint using the browser-managed HTTP-only session cookies.

## Local development

The frontend defaults to `http://localhost:3000`. The extension uses the
existing API Gateway at `https://carload-whole-phony.ngrok-free.dev`; local
development can override it with `WXT_API_BASE_URL=http://localhost:8080`.
The auth service behind the local gateway listens on `http://localhost:3001`.
The configured `WXT_API_BASE_URL` is used both for background requests and to
grant the matching API origin in the extension manifest.

```sh
npm install
npm run dev
```

Load the generated `.output/chrome-mv3-dev` directory as an unpacked extension
in Chromium. Use the FebRocket toolbar popup, and open the extension's side
panel from the browser's side-panel menu. The Login button opens the existing
FebRocket homepage; Google OAuth remains entirely in the existing website and
backend flow.

The auth backend continues to use its regular `SameSite=Lax` website cookies.
It also sets separate HTTP-only, `Secure`, `SameSite=None` companion cookies
restricted to `/api/auth/me` and `/api/auth/refresh` so the extension background
can check and refresh the existing FebRocket session without reading or
persisting token values. Extension auth state is kept in background memory only,
revalidated when the popup or side panel connects and every 30 seconds while it
remains open. Logout clears both cookie sets; account changes are detected by
the next check. A session expiration during an open extension page clears the
displayed user and prompts the user to sign in on the existing website.

## AI form mapping

Choose a person profile in the popup or side panel and use **Map Form with AI**
to request `POST /api/forms/map` through the existing API Gateway session.
High-confidence suggestions are filled only into currently empty fields.
Lower-confidence mapped suggestions are shown for explicit confirmation;
ambiguous, missing, invalid, or unsupported fields are never filled. The
extension does not send document contents or keep AI credentials.

## Checks

```sh
npm run compile
npm run build
```

Backend auth cookie behavior is covered by:

```sh
cd ../backend/auth-service
npm test
```
