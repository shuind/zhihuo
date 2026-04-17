type SessionLike = {
  userId?: string | null;
} | null | undefined;

type UserLike = {
  id?: string | null;
  deleted_at?: string | null;
} | null | undefined;

export function canAccessGuestMode() {
  return true;
}

export function isNativeAppRuntime() {
  if (typeof window === "undefined") return false;
  const runtime = (window as Window & {
    Capacitor?: { isNativePlatform?: () => boolean };
  }).Capacitor;
  return typeof runtime?.isNativePlatform === "function" ? runtime.isNativePlatform() : false;
}

export function canUseCloudSync(session: SessionLike) {
  return typeof session?.userId === "string" && session.userId.trim().length > 0;
}

export function canImportUserData(user: UserLike) {
  return typeof user?.id === "string" && user.id.trim().length > 0 && !user.deleted_at;
}

export const canSyncUserData = canImportUserData;
