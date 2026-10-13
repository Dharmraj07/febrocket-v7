"use client";

import UserDashboard from "@/features/userDashboard/components/UserDashboard";
import RoleGuard from "@/features/dashboard/components/RoleGuard";

export default function UserDashboardPage() {
  return (
    <RoleGuard role="user">
      <UserDashboard />
    </RoleGuard>
  );
}
