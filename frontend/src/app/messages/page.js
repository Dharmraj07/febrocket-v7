"use client";

import UserMessagesPage from "@/features/messages/components/UserMessagesPage";
import RoleGuard from "@/features/dashboard/components/RoleGuard";

export default function MessagesPage() {
  return (
    <RoleGuard role="user">
      <UserMessagesPage />
    </RoleGuard>
  );
}
