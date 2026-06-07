export const AUTO_SEAL_PREFERENCES_STORAGE_KEY = "zhihuo_auto_seal_preferences_v1";

export type AutoSealPreferences = {
  disabled: boolean;
  snoozedUntilBySpaceId: Record<string, string>;
};

export const AUTO_SEAL_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

export const DEFAULT_AUTO_SEAL_PREFERENCES: AutoSealPreferences = {
  disabled: false,
  snoozedUntilBySpaceId: {}
};

export function loadAutoSealPreferences(): AutoSealPreferences {
  if (typeof window === "undefined") return DEFAULT_AUTO_SEAL_PREFERENCES;
  try {
    return normalizeAutoSealPreferences(JSON.parse(window.localStorage.getItem(AUTO_SEAL_PREFERENCES_STORAGE_KEY) ?? "{}"));
  } catch {
    return DEFAULT_AUTO_SEAL_PREFERENCES;
  }
}

export function saveAutoSealPreferences(preferences: AutoSealPreferences) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTO_SEAL_PREFERENCES_STORAGE_KEY, JSON.stringify(normalizeAutoSealPreferences(preferences)));
}

export function normalizeAutoSealPreferences(input: unknown): AutoSealPreferences {
  const raw = input && typeof input === "object" && !Array.isArray(input) ? (input as Partial<AutoSealPreferences>) : {};
  const snoozedUntilBySpaceId: Record<string, string> = {};
  const rawSnoozes =
    raw.snoozedUntilBySpaceId && typeof raw.snoozedUntilBySpaceId === "object" && !Array.isArray(raw.snoozedUntilBySpaceId)
      ? raw.snoozedUntilBySpaceId
      : {};

  for (const [spaceId, value] of Object.entries(rawSnoozes)) {
    if (typeof value !== "string") continue;
    const time = new Date(value).getTime();
    if (!spaceId || !Number.isFinite(time)) continue;
    snoozedUntilBySpaceId[spaceId] = new Date(time).toISOString();
  }

  return {
    disabled: raw.disabled === true,
    snoozedUntilBySpaceId
  };
}

export function pruneAutoSealPreferences(preferences: AutoSealPreferences, activeSpaceIds: Iterable<string>, nowMs = Date.now()) {
  const activeIdSet = new Set(activeSpaceIds);
  const snoozedUntilBySpaceId: Record<string, string> = {};

  for (const [spaceId, value] of Object.entries(preferences.snoozedUntilBySpaceId)) {
    const time = new Date(value).getTime();
    if (!activeIdSet.has(spaceId) || !Number.isFinite(time) || time <= nowMs) continue;
    snoozedUntilBySpaceId[spaceId] = new Date(time).toISOString();
  }

  return {
    disabled: preferences.disabled,
    snoozedUntilBySpaceId
  };
}

export function isAutoSealSnoozed(preferences: AutoSealPreferences, spaceId: string, nowMs = Date.now()) {
  const until = preferences.snoozedUntilBySpaceId[spaceId];
  if (!until) return false;
  const time = new Date(until).getTime();
  return Number.isFinite(time) && time > nowMs;
}
