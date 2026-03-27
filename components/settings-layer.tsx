"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { copyText } from "@/components/zhihuo-model";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "中国标准时间 (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "日本标准时间 (UTC+09:00)" },
  { value: "America/Los_Angeles", label: "太平洋时间 (UTC-08:00/-07:00)" },
  { value: "America/New_York", label: "美东时间 (UTC-05:00/-04:00)" },
  { value: "Europe/London", label: "伦敦时间 (UTC+00:00/+01:00)" }
];

export function SettingsLayer(props: {
  timezone: string;
  setTimezone: (timezone: string) => void;
  activeThinkingSpaces: Array<{ id: string; title: string }>;
  fixedTopSpacesEnabled: boolean;
  fixedTopSpaceIds: string[];
  setFixedTopSpacesEnabled: (enabled: boolean) => void;
  setFixedTopSpaceIds: (ids: string[]) => void;
  onSystemExport: (options: { includeLife: boolean; includeThinking: boolean }) => Promise<string | null>;
  onClearAll: () => void;
  onLogout: () => void;
  showNotice: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [includeLife, setIncludeLife] = useState(true);
  const [includeThinking, setIncludeThinking] = useState(true);
  const [exportText, setExportText] = useState("");
  const [loadingExport, setLoadingExport] = useState(false);

  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.some((item) => item.value === props.timezone)) return TIMEZONE_OPTIONS;
    return [{ value: props.timezone, label: `${props.timezone} (当前)` }, ...TIMEZONE_OPTIONS];
  }, [props.timezone]);

  const pinnedSet = useMemo(() => new Set(props.fixedTopSpaceIds), [props.fixedTopSpaceIds]);

  const loadExport = () => {
    if (!includeLife && !includeThinking) {
      props.showNotice("请至少选择一个导出层");
      return;
    }
    setLoadingExport(true);
    void (async () => {
      const text = await props.onSystemExport({ includeLife, includeThinking });
      setExportText(text ?? "");
      setLoadingExport(false);
    })();
  };

  return (
    <div className="h-full overflow-y-auto px-4 pb-8 pt-4 md:px-8">
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>时区设置</CardTitle>
            <CardDescription>用于时间层和思路层的本地显示。</CardDescription>
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
            </label>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>思路顶部空间</CardTitle>
            <CardDescription>固定显示三个空间，不会被最新修改的空间刷掉。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={props.fixedTopSpacesEnabled}
                onChange={(event) => props.setFixedTopSpacesEnabled(event.target.checked)}
                className="h-4 w-4 accent-slate-800"
              />
              固定显示三个空间
            </label>
            <div className="space-y-2 rounded-lg border border-slate-300 bg-white p-3">
              <p className="text-xs text-slate-500">仅可选择活跃空间（最多 3 个，按选中顺序显示）</p>
              <div className="flex flex-wrap gap-2">
                {props.activeThinkingSpaces.length ? (
                  props.activeThinkingSpaces.map((space) => {
                    const selected = pinnedSet.has(space.id);
                    const order = props.fixedTopSpaceIds.indexOf(space.id);
                    return (
                      <button
                        key={space.id}
                        type="button"
                        className={
                          selected
                            ? "rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-white"
                            : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600"
                        }
                        onClick={() => {
                          if (!selected && props.fixedTopSpaceIds.length >= 3) {
                            props.showNotice("最多固定 3 个空间");
                            return;
                          }
                          const nextIds = selected
                            ? props.fixedTopSpaceIds.filter((id) => id !== space.id)
                            : [...props.fixedTopSpaceIds, space.id];
                          props.setFixedTopSpaceIds(nextIds);
                        }}
                      >
                        {selected ? `${order + 1}. ` : ""}
                        {space.title}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-slate-500">暂无活跃空间</p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>全量导出</CardTitle>
            <CardDescription>仅支持 Markdown 导出，可选时间层 / 思路层。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={includeLife}
                  onChange={(event) => setIncludeLife(event.target.checked)}
                  className="h-4 w-4 accent-slate-800"
                />
                时间层
              </label>
              <label className="inline-flex items-center gap-2 text-slate-700">
                <input
                  type="checkbox"
                  checked={includeThinking}
                  onChange={(event) => setIncludeThinking(event.target.checked)}
                  className="h-4 w-4 accent-slate-800"
                />
                思路层
              </label>
            </div>
            <Textarea
              readOnly
              data-zh-input="multiline"
              value={loadingExport ? "导出生成中..." : exportText}
              className="min-h-[220px] resize-y border-slate-300 bg-white font-mono text-xs leading-[1.65] text-slate-700 [overflow-wrap:anywhere]"
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
            <CardTitle>清空数据</CardTitle>
            <CardDescription>清空后无法恢复，请谨慎操作。</CardDescription>
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
                清空全部
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

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>账号 / 会话</CardTitle>
            <CardDescription>退出当前登录账号。</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={props.onLogout}
            >
              退出登录
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
