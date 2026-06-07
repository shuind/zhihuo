import type { DbState } from "@/lib/server/types";
import { nowIso } from "@/lib/server/utils";

function toTimestamp(value: string | null | undefined) {
  if (typeof value !== "string" || !value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function toDateKeyInTimeZone(timestamp: number, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date(timestamp));
}

function shiftDateKey(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export type SystemMonitorMetrics = {
  users: {
    total: number;
    new_today: number;
  };
  active_users: {
    d1: number;
    d3: number;
  };
  content: {
    time_entries_total: number;
    spaces_total: number;
    spaces_settled: number;
    thought_items_total: number;
    scratch_open_total: number;
  };
  flow_3d: Array<{
    date: string;
    users_new: number;
    time_entries_new: number;
    spaces_new: number;
    writes_to_time: number;
  }>;
  generated_at: string;
};

export function getSystemMonitorMetrics(db: DbState): SystemMonitorMetrics {
  const now = Date.now();
  const monitorTimeZone = "Asia/Shanghai";
  const todayKey = toDateKeyInTimeZone(now, monitorTimeZone);
  const trendKeys = [shiftDateKey(todayKey, -2), shiftDateKey(todayKey, -1), todayKey];
  const trendKeySet = new Set(trendKeys);
  const start3dKey = trendKeys[0];

  const activeUsers = db.users.filter((user) => !user.deleted_at);
  const activeUserIds = new Set(activeUsers.map((user) => user.id));

  const doubts = db.doubts.filter((item) => !item.deleted_at && activeUserIds.has(item.user_id));
  const spaces = db.thinking_spaces.filter((item) => activeUserIds.has(item.user_id));
  const spaceIds = new Set(spaces.map((space) => space.id));
  const spaceUserById = new Map(spaces.map((space) => [space.id, space.user_id]));
  const nodes = db.thinking_nodes.filter((node) => spaceIds.has(node.space_id));
  const thoughtItems = nodes.filter((node) => node.state === "normal");
  const scratchEvents = db.thinking_scratch.filter((item) => !item.deleted_at && activeUserIds.has(item.user_id));
  const scratchOpen = scratchEvents.filter((item) => !item.archived_at && !item.derived_space_id && !item.fed_time_doubt_id);
  const audits = db.audit_logs.filter((item) => activeUserIds.has(item.user_id));

  const countOnDate = <T>(items: T[], dateSelector: (item: T) => string | null | undefined, targetDateKey: string) => {
    let count = 0;
    for (const item of items) {
      const timestamp = toTimestamp(dateSelector(item));
      if (timestamp === null) continue;
      if (toDateKeyInTimeZone(timestamp, monitorTimeZone) === targetDateKey) count += 1;
    }
    return count;
  };

  const activeD1 = new Set<string>();
  const activeD3 = new Set<string>();
  const markActive = (userId: string, at: string | null | undefined) => {
    const timestamp = toTimestamp(at);
    if (timestamp === null) return;
    const dateKey = toDateKeyInTimeZone(timestamp, monitorTimeZone);
    if (dateKey === todayKey) activeD1.add(userId);
    if (dateKey >= start3dKey && dateKey <= todayKey) activeD3.add(userId);
  };

  for (const item of doubts) markActive(item.user_id, item.created_at);
  for (const item of spaces) markActive(item.user_id, item.created_at);
  for (const item of nodes) {
    const userId = spaceUserById.get(item.space_id);
    if (!userId) continue;
    markActive(userId, item.created_at);
  }
  for (const item of scratchEvents) markActive(item.user_id, item.updated_at || item.created_at);
  for (const item of audits) markActive(item.user_id, item.created_at);

  const trends = new Map<
    string,
    { date: string; users_new: number; time_entries_new: number; spaces_new: number; writes_to_time: number }
  >();
  for (const dateKey of trendKeys) {
    trends.set(dateKey, { date: dateKey, users_new: 0, time_entries_new: 0, spaces_new: 0, writes_to_time: 0 });
  }

  const appendTrend = (
    at: string | null | undefined,
    field: "users_new" | "time_entries_new" | "spaces_new" | "writes_to_time"
  ) => {
    const timestamp = toTimestamp(at);
    if (timestamp === null) return;
    const key = toDateKeyInTimeZone(timestamp, monitorTimeZone);
    if (!trendKeySet.has(key)) return;
    const row = trends.get(key);
    if (!row) return;
    row[field] += 1;
  };

  for (const user of activeUsers) appendTrend(user.created_at, "users_new");
  for (const doubt of doubts) appendTrend(doubt.created_at, "time_entries_new");
  for (const space of spaces) appendTrend(space.created_at, "spaces_new");
  for (const space of spaces) appendTrend(space.frozen_at, "writes_to_time");
  const spacesSettled = spaces.filter((space) => typeof space.frozen_at === "string" && space.frozen_at.length > 0).length;

  return {
    users: {
      total: activeUsers.length,
      new_today: countOnDate(activeUsers, (item) => item.created_at, todayKey)
    },
    active_users: {
      d1: activeD1.size,
      d3: activeD3.size
    },
    content: {
      time_entries_total: doubts.length,
      spaces_total: spaces.length,
      spaces_settled: spacesSettled,
      thought_items_total: thoughtItems.length,
      scratch_open_total: scratchOpen.length
    },
    flow_3d: trendKeys.map((dateKey) => trends.get(dateKey)!),
    generated_at: nowIso()
  };
}
