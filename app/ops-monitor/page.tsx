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
  generated_at: string;
};

function formatNumber(value: number) {
  return new Intl.NumberFormat("zh-CN").format(value);
}

export default function OpsMonitorPage() {
  const router = useRouter();
  const [data, setData] = useState<MonitorPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
      setError("网络异常，请稍后重试");
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    void load();
  }, [load]);

  const maxTrend = useMemo(() => {
    if (!data?.flow_3d.length) return 1;
    return Math.max(
      1,
      ...data.flow_3d.flatMap((item) => [item.users_new, item.time_entries_new, item.spaces_new, item.writes_to_time])
    );
  }, [data]);

  return (
    <main className="min-h-screen bg-slate-950 px-6 py-8 text-slate-100 md:px-10">
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
            <section className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
              <MetricCard label="总用户" value={formatNumber(data.users.total)} />
              <MetricCard label="今日新增用户" value={formatNumber(data.users.new_today)} />
              <MetricCard label="今日活跃用户" value={formatNumber(data.active_users.d1)} />
              <MetricCard label="近3日活跃用户" value={formatNumber(data.active_users.d3)} />
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
              <h2 className="text-sm tracking-[0.06em] text-slate-300">最近3日流动</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="text-slate-400">
                    <tr>
                      <th className="py-2 pr-4 font-normal">日期</th>
                      <th className="py-2 pr-4 font-normal">新增用户</th>
                      <th className="py-2 pr-4 font-normal">新增时间条目</th>
                      <th className="py-2 pr-4 font-normal">新增思路空间</th>
                      <th className="py-2 font-normal">写入时间次数</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.flow_3d.map((item) => (
                      <tr key={item.date} className="border-t border-slate-800/80 text-slate-200">
                        <td className="py-2 pr-4 text-slate-300">{item.date}</td>
                        <td className="py-2 pr-4">
                          <TrendValue value={item.users_new} max={maxTrend} />
                        </td>
                        <td className="py-2 pr-4">
                          <TrendValue value={item.time_entries_new} max={maxTrend} />
                        </td>
                        <td className="py-2 pr-4">
                          <TrendValue value={item.spaces_new} max={maxTrend} />
                        </td>
                        <td className="py-2">
                          <TrendValue value={item.writes_to_time} max={maxTrend} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <p className="text-xs text-slate-500">数据生成时间：{new Date(data.generated_at).toLocaleString("zh-CN")}</p>
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

function TrendValue(props: { value: number; max: number }) {
  const width = `${Math.max(6, Math.round((props.value / props.max) * 100))}%`;
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-slate-300">{props.value}</span>
      <div className="h-1.5 w-20 rounded-full bg-slate-800">
        <div className="h-full rounded-full bg-slate-500" style={{ width }} />
      </div>
    </div>
  );
}

