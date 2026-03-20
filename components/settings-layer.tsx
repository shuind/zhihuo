"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { copyText } from "@/components/zhihuo-model";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "北京时间 (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "东京时间 (UTC+09:00)" },
  { value: "America/Los_Angeles", label: "洛杉矶时间 (UTC-08:00/-07:00)" },
  { value: "America/New_York", label: "纽约时间 (UTC-05:00/-04:00)" },
  { value: "Europe/London", label: "伦敦时间 (UTC+00:00/+01:00)" }
];

export function SettingsLayer(props: {
  payload: unknown;
  timezone: string;
  setTimezone: (timezone: string) => void;
  onSystemExport: (format: "json" | "markdown") => Promise<string | null>;
  onClearAll: () => void;
  showNotice: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "markdown">("json");
  const [exportText, setExportText] = useState("");
  const [loadingExport, setLoadingExport] = useState(false);
  const payloadText = useMemo(() => JSON.stringify(props.payload, null, 2), [props.payload]);
  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.some((item) => item.value === props.timezone)) return TIMEZONE_OPTIONS;
    return [{ value: props.timezone, label: `${props.timezone} (当前)` }, ...TIMEZONE_OPTIONS];
  }, [props.timezone]);

  const loadExport = () => {
    setLoadingExport(true);
    void (async () => {
      const text = await props.onSystemExport(exportFormat);
      setExportText(text ?? (exportFormat === "json" ? payloadText : ""));
      setLoadingExport(false);
    })();
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-8 pt-4 md:px-8">
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>系统设置</CardTitle>
            <CardDescription>调整时间显示与导出参数。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="grid gap-2 rounded-lg border border-slate-300 bg-white px-3 py-3">
              <span className="text-sm text-slate-700">时区</span>
              <select
                value={props.timezone}
                className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                onChange={(event) => {
                  props.setTimezone(event.target.value);
                  props.showNotice("时区已更新");
                }}
              >
                {timezoneOptions.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
              <span className="text-xs text-slate-500">时间层与思路卡片时间会按所选时区显示。</span>
            </label>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>全量导出</CardTitle>
            <CardDescription>支持 JSON 备份与 Markdown 阅读版导出。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="inline-flex rounded-full border border-slate-300 bg-white p-1">
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs ${exportFormat === "json" ? "bg-slate-900 text-slate-50" : "text-slate-600"}`}
                onClick={() => setExportFormat("json")}
              >
                JSON
              </button>
              <button
                type="button"
                className={`rounded-full px-3 py-1 text-xs ${exportFormat === "markdown" ? "bg-slate-900 text-slate-50" : "text-slate-600"}`}
                onClick={() => setExportFormat("markdown")}
              >
                Markdown
              </button>
            </div>
            <Textarea
              readOnly
              value={loadingExport ? "导出生成中..." : exportText}
              className="min-h-[220px] resize-y border-slate-300 bg-white font-mono text-xs text-slate-700"
            />
          </CardContent>
          <CardFooter className="gap-2">
            <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={loadExport}>
              生成导出
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={() => void copyText(exportText, () => props.showNotice("已复制导出内容"))}
            >
              复制
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-red-400/35 bg-red-50/90 text-red-900">
          <CardHeader>
            <CardTitle>危险操作</CardTitle>
            <CardDescription>全量删除不可恢复，会清理所有关联数据。</CardDescription>
          </CardHeader>
          <CardFooter className="gap-2">
            {!confirmClear ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-red-400/40 bg-red-100/70 text-red-800"
                onClick={() => setConfirmClear(true)}
              >
                清空全部数据
              </Button>
            ) : (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                  onClick={() => setConfirmClear(false)}
                >
                  取消
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-red-500/50 bg-red-200/60 text-red-900"
                  onClick={props.onClearAll}
                >
                  确认清空
                </Button>
              </>
            )}
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
