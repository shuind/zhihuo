import {
  DEFAULT_MONITOR_RESPONSE_BYTES,
  MONITOR_PRUNE_INTERVAL_MS,
  MONITOR_RETENTION_DAYS,
  MONITOR_TIME_ZONE
} from "@/lib/server/db/config";
import { nowIso } from "@/lib/server/db/normalize";
import { getPool, shouldUsePostgres, withPgRetry } from "@/lib/server/db/postgres-runtime";

export type MonitorTrafficMetrics = {
  traffic_now: { qps_1m: number; bandwidth_mbps_est_1m: number };
  traffic_peak_3d: Array<{ date: string; peak_qps: number; p95_minute_qps: number; peak_bandwidth_mbps_est: number }>;
};

let monitorLastPruneAt = 0;

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

function recentDateKeys(days: number) {
  const today = toDateKeyInTimeZone(Date.now(), MONITOR_TIME_ZONE);
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) keys.push(shiftDateKey(today, -i));
  return keys;
}

function percentile(values: number[], p: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.max(0, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

export async function recordApiMinuteStat(
  args: { route: string; status: number; responseBytes?: number | null },
  ensurePgReady: () => Promise<void>
) {
  if (!shouldUsePostgres()) return;
  const pool = getPool();
  if (!pool) return;
  await ensurePgReady();

  const statusClass = args.status >= 500 ? "5xx" : args.status >= 400 ? "4xx" : "2xx";
  const responseBytes =
    typeof args.responseBytes === "number" && Number.isFinite(args.responseBytes) && args.responseBytes > 0
      ? Math.round(args.responseBytes)
      : DEFAULT_MONITOR_RESPONSE_BYTES;
  const now = Date.now();
  const shouldPrune = now - monitorLastPruneAt >= MONITOR_PRUNE_INTERVAL_MS;

  await withPgRetry("recordApiMinuteStat", async () => {
    const client = await pool.connect();
    try {
      if (shouldPrune) {
        await client.query(
          `DELETE FROM api_request_minute_stats
           WHERE date_key < to_char((now() AT TIME ZONE 'Asia/Shanghai') - ($1::int * INTERVAL '1 day'), 'YYYY-MM-DD')`,
          [MONITOR_RETENTION_DAYS]
        );
        monitorLastPruneAt = now;
      }
      await client.query(
        `INSERT INTO api_request_minute_stats (
           minute_key, date_key, route, status_class, request_count, response_bytes_sum, updated_at
         ) VALUES (
           to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD HH24:MI'),
           to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD'),
           $1, $2, 1, $3, $4
         )
         ON CONFLICT (minute_key, route, status_class) DO UPDATE
         SET request_count = api_request_minute_stats.request_count + 1,
             response_bytes_sum = api_request_minute_stats.response_bytes_sum + EXCLUDED.response_bytes_sum,
             updated_at = EXCLUDED.updated_at`,
        [args.route, statusClass, responseBytes, nowIso()]
      );
    } finally {
      client.release();
    }
  });
}

export async function readMonitorTrafficMetrics(ensurePgReady: () => Promise<void>): Promise<MonitorTrafficMetrics> {
  const days = recentDateKeys(3);
  const empty: MonitorTrafficMetrics = {
    traffic_now: { qps_1m: 0, bandwidth_mbps_est_1m: 0 },
    traffic_peak_3d: days.map((date) => ({
      date,
      peak_qps: 0,
      p95_minute_qps: 0,
      peak_bandwidth_mbps_est: 0
    }))
  };

  if (!shouldUsePostgres()) return empty;
  const pool = getPool();
  if (!pool) return empty;
  await ensurePgReady();

  const { minuteRows, nowRow } = await withPgRetry("readMonitorTrafficMetrics", async () => {
    const client = await pool.connect();
    try {
      const minuteRowsResult = await client.query<{
        date_key: string;
        minute_key: string;
        total_count: string;
        total_bytes: string;
      }>(
        `SELECT
           date_key,
           minute_key,
           SUM(request_count)::text AS total_count,
           SUM(response_bytes_sum)::text AS total_bytes
         FROM api_request_minute_stats
         WHERE date_key = ANY($1)
           AND route LIKE '/v1/%'
           AND route <> '/v1/health'
         GROUP BY date_key, minute_key
         ORDER BY date_key, minute_key`,
        [days]
      );

      const nowRowResult = await client.query<{ total_count: string; total_bytes: string }>(
        `SELECT
           COALESCE(SUM(request_count), 0)::text AS total_count,
           COALESCE(SUM(response_bytes_sum), 0)::text AS total_bytes
         FROM api_request_minute_stats
         WHERE minute_key = to_char((now() AT TIME ZONE 'Asia/Shanghai'), 'YYYY-MM-DD HH24:MI')
           AND route LIKE '/v1/%'
           AND route <> '/v1/health'`
      );
      return { minuteRows: minuteRowsResult.rows, nowRow: nowRowResult.rows[0] ?? { total_count: "0", total_bytes: "0" } };
    } finally {
      client.release();
    }
  });

  const byDate = new Map<string, Array<{ count: number; bytes: number }>>();
  for (const row of minuteRows) {
    const count = Number(row.total_count ?? "0");
    const bytes = Number(row.total_bytes ?? "0");
    if (!byDate.has(row.date_key)) byDate.set(row.date_key, []);
    byDate.get(row.date_key)!.push({
      count: Number.isFinite(count) ? count : 0,
      bytes: Number.isFinite(bytes) ? bytes : 0
    });
  }

  const trafficPeak3d = days.map((date) => {
    const samples = byDate.get(date) ?? [];
    if (!samples.length) {
      return { date, peak_qps: 0, p95_minute_qps: 0, peak_bandwidth_mbps_est: 0 };
    }

    const minuteQps = samples.map((item) => item.count / 60);
    const minuteBandwidthMbps = samples.map((item) => (item.bytes * 8) / 60 / 1_000_000);
    const peakQps = Math.max(...minuteQps, 0);
    const p95Qps = percentile(minuteQps, 95);
    const peakBandwidthMbps = Math.max(...minuteBandwidthMbps, 0);

    return {
      date,
      peak_qps: Number(peakQps.toFixed(3)),
      p95_minute_qps: Number(p95Qps.toFixed(3)),
      peak_bandwidth_mbps_est: Number(peakBandwidthMbps.toFixed(3))
    };
  });

  const nowCount = Number(nowRow.total_count ?? "0");
  const nowBytes = Number(nowRow.total_bytes ?? "0");
  const qpsNow = (Number.isFinite(nowCount) ? nowCount : 0) / 60;
  const bandwidthNow = ((Number.isFinite(nowBytes) ? nowBytes : 0) / 60) * 8 / 1_000_000;

  return {
    traffic_now: {
      qps_1m: Number(qpsNow.toFixed(3)),
      bandwidth_mbps_est_1m: Number(bandwidthNow.toFixed(3))
    },
    traffic_peak_3d: trafficPeak3d
  };
}
