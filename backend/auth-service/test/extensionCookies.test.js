const test = require("node:test");
const assert = require("node:assert/strict");
const config = require("../config");
const authController = require("../controllers/authController");
const { setCookies, clearCookies } = require("../utils/authHelpers");

const createResponse = () => {
  const cookies = [];
  const clearedCookies = [];
  return {
    cookies,
    clearedCookies,
    cookie(name, value, options) {
      cookies.push({ name, value, options });
    },
    clearCookie(name, options) {
      clearedCookies.push({ name, options });
    },
  };
};

test("extension companion cookies are HTTP-only and limited to auth read/refresh routes", () => {
  const response = createResponse();
  setCookies(response, "access-token", "refresh-token");

  const extensionAccess = response.cookies.find(
    ({ name }) => name === config.COOKIE_NAMES.EXTENSION_ACCESS,
  );
  const extensionRefresh = response.cookies.find(
    ({ name }) => name === config.COOKIE_NAMES.EXTENSION_REFRESH,
  );

  assert.equal(extensionAccess.value, "access-token");
  assert.deepEqual(
    {
      httpOnly: extensionAccess.options.httpOnly,
      sameSite: extensionAccess.options.sameSite,
      secure: extensionAccess.options.secure,
      path: extensionAccess.options.path,
    },
    {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/api/auth/me",
    },
  );
  assert.equal(extensionRefresh.value, "refresh-token");
  assert.deepEqual(
    {
      httpOnly: extensionRefresh.options.httpOnly,
      sameSite: extensionRefresh.options.sameSite,
      secure: extensionRefresh.options.secure,
      path: extensionRefresh.options.path,
    },
    {
      httpOnly: true,
      sameSite: "none",
      secure: true,
      path: "/api/auth/refresh",
    },
  );
});

test("logout clears extension companion cookies with their original paths", () => {
  const response = createResponse();
  clearCookies(response);

  assert.deepEqual(
    response.clearedCookies
      .filter(({ name }) => name.startsWith("extension_"))
      .map(({ name, options }) => [
        name,
        options.path,
        options.sameSite,
        options.secure,
      ]),
    [
      [config.COOKIE_NAMES.EXTENSION_ACCESS, "/api/auth/me", "none", true],
      [config.COOKIE_NAMES.EXTENSION_REFRESH, "/api/auth/refresh", "none", true],
    ],
  );
});

test("an authenticated website session provisions extension cookies", () => {
  const response = createResponse();
  let nextCalled = false;

  authController.attachExtensionCookies(
    {
      cookies: {
        [config.COOKIE_NAMES.ACCESS]: "website-access",
        [config.COOKIE_NAMES.REFRESH]: "website-refresh",
      },
    },
    response,
    () => {
      nextCalled = true;
    },
  );

  assert.equal(nextCalled, true);
  assert.deepEqual(
    response.cookies.map(({ name, value }) => [name, value]),
    [
      [config.COOKIE_NAMES.EXTENSION_ACCESS, "website-access"],
      [config.COOKIE_NAMES.EXTENSION_REFRESH, "website-refresh"],
    ],
  );
});

test("extension refresh origin validation accepts browser extension origins only", () => {
  assert.equal(
    authController.isBrowserExtensionOrigin(
      "chrome-extension://abcdefghijklmnopabcdefghijklmnop",
    ),
    true,
  );
  assert.equal(
    authController.isBrowserExtensionOrigin(
      "moz-extension://12345678-1234-1234-1234-123456789abc",
    ),
    true,
  );
  assert.equal(
    authController.isBrowserExtensionOrigin("https://febrocket.example"),
    false,
  );
  assert.equal(authController.isBrowserExtensionOrigin(undefined), false);
});
