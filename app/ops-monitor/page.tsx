"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type MonitorPayload = {
  users: { total: number; new_today: number };
  active_users: { d1: number; d3: number };
  content: {
    time_entries_total: number;
    spaces_total: number;
    spaces_settled: number;
    thought_items_total: number;
    scratch_open_total: number;
  };
  flow_3d: Array<{ date: string; users_new: number; time_entries_new: number; spaces_new: number; writes_to_time: number }>;
  traffic_now: { qps_1m: number; bandwidth_mbps_est_1m: number };
  traffic_peak_3d: Array<{ date: string; peak_qps: number; p95_minute_qps: number; peak_bandwidth_mbps_est: number }>;
  generated_at: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

function formatDecimal(value: number, digits = 3) {
  if (!Number.isFinite(value)) return "0";
  return value.toFixed(digits);
}

export default function OpsMonitorPage() {
  const router = useRouter();
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;
    html.style.overflow = "auto";
    body.style.overflow = "auto";
    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/v1/system/monitor", { method: "GET", cache: "no-store" });
      if (response.status === 401) {
        router.replace("/");
        return;
      }
      const payload = (await response.json()) as MonitorPayload | { error?: string };
      if (!response.ok) {
        setError(typeof payload === "object" && payload && "error" in payload ? String(payload.error ?? "加载失败") : "加载失败");
        setLoading(false);
        return;
      }
      setData(payload as MonitorPayload);
      setLoading(false);
    } catch {
      setError("请求失败，请稍后重试");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const peakSummary = useMemo(() => {
    if (!data?.traffic_peak_3d?.length) {
      return { peakQps: 0, peakBandwidth: 0 };
    }
    return data.traffic_peak_3d.reduce(
      (acc, row) => ({
        peakQps: Math.max(acc.peakQps, row.peak_qps),
        peakBandwidth: Math.max(acc.peakBandwidth, row.peak_bandwidth_mbps_est)
      }),
      { peakQps: 0, peakBandwidth: 0 }
    );
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 pb-24 text-slate-100 md:px-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">Ops Monitor</p>
            <h1 className="mt-2 text-2xl font-medium tracking-[0.04em] text-slate-100">运营监控面板</h1>
            <p className="mt-2 text-sm text-slate-400">全站聚合视角（隐藏入口）</p>
          </div>
          <button
            type="button"
            className="rounded-full border border-slate-700 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-slate-500 hover:text-white"
            onClick={() => void load()}
          >
            刷新
          </button>
        </header>

        {loading ? (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-sm text-slate-300">加载中...</div>
        ) : error ? (
          <div className="rounded-2xl border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-200">{error}</div>
        ) : data ? (
          <>
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
              <MetricCard label="总用户" value={formatNumber(data.users.total)} />
              <MetricCard label="今日新增用户" value={formatNumber(data.users.new_today)} />
              <MetricCard label="今日活跃用户" value={formatNumber(data.active_users.d1)} />
              <MetricCard label="近3日活跃用户" value={formatNumber(data.active_users.d3)} />
              <MetricCard label="近3日最高QPS" value={formatDecimal(peakSummary.peakQps)} />
              <MetricCard label="近3日最高带宽估算(Mbps)" value={formatDecimal(peakSummary.peakBandwidth)} />
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm tracking-[0.06em] text-slate-300">内容规模</h2>
              <div className="mt-4 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
                <MetricPill label="时间条目总量" value={data.content.time_entries_total} />
                <MetricPill label="思路空间总量" value={data.content.spaces_total} />
                <MetricPill label="已沉淀空间" value={data.content.spaces_settled} />
                <MetricPill label="思路条目总量" value={data.content.thought_items_total} />
                <MetricPill label="待处理随记" value={data.content.scratch_open_total} />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
              <h2 className="text-sm tracking-[0.06em] text-slate-300">最近3日峰值流量</h2>
              <div className="mt-3 text-xs text-slate-500">
                当前1分钟：QPS {formatDecimal(data.traffic_now.qps_1m)} / 带宽估算 {formatDecimal(data.traffic_now.bandwidth_mbps_est_1m)} Mbps
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2 pr-4 font-normal">日期</th>
                      <th className="py-2 pr-4 font-normal">峰值QPS</th>
                      <th className="py-2 pr-4 font-normal">P95分钟QPS</th>
                      <th className="py-2 font-normal">峰值带宽估算(Mbps)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.traffic_peak_3d.map((row) => (
                      <tr key={row.date} className="border-t border-slate-800/80 text-slate-200">
                        <td className="py-2 pr-4 text-slate-300">{row.date}</td>
                        <td className="py-2 pr-4">{formatDecimal(row.peak_qps)}</td>
                        <td className="py-2 pr-4">{formatDecimal(row.p95_minute_qps)}</td>
                        <td className="py-2">{formatDecimal(row.peak_bandwidth_mbps_est)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-slate-500">数据更新时间：{new Date(data.generated_at).toLocaleString("zh-CN")}</p>
          </>
        ) : null}
      </div>
    </main>
  );
}

function MetricCard(props: { label: string; value: string }) {
  return (
    <article className="rounded-2xl border border-slate-800 bg-slate-900/70 p-5">
      <p className="text-xs tracking-[0.08em] text-slate-400">{props.label}</p>
      <p className="mt-2 text-2xl text-slate-100">{props.value}</p>
    </article>
  );
}

function MetricPill(props: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-3">
      <p className="text-xs text-slate-400">{props.label}</p>
      <p className="mt-1 text-base text-slate-100">{formatNumber(props.value)}</p>
    </div>
  );
}
