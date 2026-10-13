"use client";

import BusinessDashboard from "@/features/businessDashboard/components/BusinessDashboard";
import RoleGuard from "@/features/dashboard/components/RoleGuard";

export default function BusinessDashboardPage() {
  return (
    <RoleGuard role="business">
      <BusinessDashboard />
    </RoleGuard>
  );
}
