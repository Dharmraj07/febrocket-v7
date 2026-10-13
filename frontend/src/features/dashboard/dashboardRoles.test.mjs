import test from "node:test";
import assert from "node:assert/strict";

import {
  DASHBOARD_ROUTES,
  getDashboardRoute,
  getUserRole,
} from "./dashboardRoles.js";

test("dashboard routing recognizes the three supported roles", () => {
  assert.equal(getDashboardRoute({ role: "user" }), DASHBOARD_ROUTES.user);
  assert.equal(getDashboardRoute({ role: "admin" }), DASHBOARD_ROUTES.admin);
  assert.equal(
    getDashboardRoute({ role: "business" }),
    DASHBOARD_ROUTES.business
  );
});

test("missing roles preserve user access while unknown roles fail closed", () => {
  assert.equal(getUserRole(null), "user");
  assert.equal(getUserRole({}), "user");
  assert.equal(getUserRole({ role: { name: "ADMIN" } }), "admin");
  assert.equal(getUserRole({ role: "unknown" }), null);
  assert.equal(getDashboardRoute({ role: "unknown" }), "/");
});
