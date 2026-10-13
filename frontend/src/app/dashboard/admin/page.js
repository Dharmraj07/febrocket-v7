"use client";

import AdminDashboard from "@/features/adminDashboard/components/AdminDashboard";
import RoleGuard from "@/features/dashboard/components/RoleGuard";

export default function AdminDashboardPage() {
  return (
    <RoleGuard role="admin">
      <AdminDashboard />
    </RoleGuard>
  );
}
