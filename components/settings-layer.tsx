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
  onClearAll: () => void;
  showNotice: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const payloadText = useMemo(() => JSON.stringify(props.payload, null, 2), [props.payload]);

  return (
    <div className="h-full overflow-y-auto px-4 pb-8 pt-4 md:px-8">
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>系统设置</CardTitle>
            <CardDescription>可关闭智能提示。关闭后仍保留最小能力（时间记录）。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <label className="flex items-center justify-between rounded-lg border border-slate-300 bg-white px-3 py-2">
              <span className="text-sm text-slate-700">启用思路层智能提示（缺失维度与推荐疑问）</span>
              <input type="checkbox" checked={props.assistEnabled} onChange={(event) => props.setAssistEnabled(event.target.checked)} />
            </label>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>全量导出</CardTitle>
            <CardDescription>导出时间层与思考层的本地快照。</CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea readOnly value={payloadText} className="min-h-[220px] resize-y border-slate-300 bg-white font-mono text-xs text-slate-700" />
          </CardContent>
          <CardFooter>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={() => void copyText(payloadText, () => props.showNotice("已复制导出 JSON"))}
            >
              复制 JSON
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-red-400/35 bg-red-50/90 text-red-900">
          <CardHeader>
            <CardTitle>危险操作</CardTitle>
            <CardDescription>全量删除不可恢复，并清理关联派生结构。</CardDescription>
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
