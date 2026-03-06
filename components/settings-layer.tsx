"use client";

import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";

import { copyText } from "@/components/zhihuo-model";

export function SettingsLayer(props: {
  payload: unknown;
  assistEnabled: boolean;
  setAssistEnabled: (enabled: boolean) => void;
  onSystemExport: (format: "json" | "markdown") => Promise<string | null>;
  onClearAll: () => void;
  showNotice: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [exportFormat, setExportFormat] = useState<"json" | "markdown">("json");
  const [exportText, setExportText] = useState("");
  const [loadingExport, setLoadingExport] = useState(false);
  const payloadText = useMemo(() => JSON.stringify(props.payload, null, 2), [props.payload]);

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
            <CardDescription>关闭提示后，只保留最小记录能力。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2">
              <span className="text-sm text-slate-700">启用思路层辅助提示</span>
              <input type="checkbox" checked={props.assistEnabled} onChange={(event) => props.setAssistEnabled(event.target.checked)} />
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
