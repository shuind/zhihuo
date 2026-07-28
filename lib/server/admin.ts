import type { DbState } from "@/lib/server/types";

function configuredSet(value: string | undefined) {
  return new Set(
    (value ?? "")
      .split(",")
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  );
}

export function isAdminUser(db: DbState, userId: string) {
  const user = db.users.find((item) => item.id === userId && !item.deleted_at);
  if (!user) return false;

  const adminUserIds = configuredSet(process.env.ADMIN_USER_IDS);
  const adminEmails = configuredSet(process.env.ADMIN_EMAILS);
  return adminUserIds.has(user.id.toLowerCase()) || adminEmails.has(user.email.trim().toLowerCase());
}

