export const DASHBOARD_ROUTES = {
  user: "/dashboard/user",
  admin: "/dashboard/admin",
  business: "/dashboard/business",
};

export function getUserRole(user) {
  const role = user?.role?.name ?? user?.role ?? "user";
  const normalizedRole = String(role).trim().toLowerCase();

  if (normalizedRole === "admin") {
    return "admin";
  }

  if (normalizedRole === "business") {
    return "business";
  }

  if (normalizedRole === "user") {
    return "user";
  }

  return null;
}

export function getDashboardRoute(user) {
  return DASHBOARD_ROUTES[getUserRole(user)] || "/";
}
