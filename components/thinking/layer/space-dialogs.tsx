"use client";

import { Button } from "@/components/ui/button";
import { onSubmitEnter } from "@/lib/input-events";
import { cn } from "@/lib/utils";

export function RenameSpaceDialog(props: {
  open: boolean;
  draft: string;
  hint: string;
  isSaving: boolean;
  onDraftChange: (value: string) => void;
  onCancel: () => void;
  onSave: () => void;
}) {
  if (!props.open) return null;
  return (
    <div role="dialog" aria-modal="true" aria-label="重命名空间" className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="w-[560px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
        <p className="text-sm text-slate-800">重命名空间</p>
        <input
          aria-label="空间名称"
          autoFocus
          value={props.draft}
          maxLength={220}
          className="mt-3 h-11 w-full rounded-xl border border-black/12 bg-white px-3 text-sm text-slate-800 outline-none focus-visible:ring-1 focus-visible:ring-black/20"
          onChange={(event) => props.onDraftChange(event.target.value)}
          onKeyDown={onSubmitEnter(props.onSave)}
        />
        <p className="mt-1 text-xs text-slate-600">修改后会同步到空间列表与详情。</p>
        <p className={cn("mt-1 min-h-[1.2em] text-xs text-slate-600", props.hint ? "opacity-100" : "opacity-0")}>
          {props.hint}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-black/12 text-slate-700"
            onClick={props.onCancel}
          >
            取消
          </Button>
          <Button type="button" size="sm" className="rounded-full bg-slate-900 text-slate-50 hover:bg-slate-800" onClick={props.onSave}>
            {props.isSaving ? "保存中..." : "保存"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function ExportSpaceDialog(props: {
  open: boolean;
  markdown: string;
  loading: boolean;
  onClose: () => void;
  onDownload: () => void;
  onCopy: () => void;
}) {
  if (!props.open) return null;
  const hasMarkdown = Boolean(props.markdown.trim());
  return (
    <div role="dialog" aria-modal="true" aria-label="导出空间" className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="flex h-[min(760px,calc(100vh-2rem))] w-[920px] max-w-[calc(100vw-2rem)] min-h-0 flex-col rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <p className="text-sm text-slate-800">Markdown 导出</p>
            <p className="mt-1 text-xs text-slate-600">长内容可直接滚动查看，也可下载为 `.md` 文件。</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={props.loading || !hasMarkdown}
              className="rounded-full text-slate-700 hover:bg-black/[0.05] disabled:opacity-50"
              onClick={props.onDownload}
            >
              下载
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={props.loading || !hasMarkdown}
              className="rounded-full text-slate-700 hover:bg-black/[0.05] disabled:opacity-50"
              onClick={props.onCopy}
            >
              复制
            </Button>
            <button type="button" className="text-xs text-slate-600 hover:text-slate-700" onClick={props.onClose}>
              关闭
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-xl border border-black/12 bg-[#f7f4ef] px-4 py-4">
          <pre data-export-markdown="true" className="whitespace-pre-wrap break-words text-xs leading-[1.7] text-slate-700">
            {props.loading ? "导出生成中..." : props.markdown || "暂无导出内容"}
          </pre>
        </div>
      </div>
    </div>
  );
}

export function DeleteSpaceDialog(props: {
  open: boolean;
  spaceTitle: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (!props.open) return null;
  return (
    <div role="alertdialog" aria-modal="true" aria-label="删除空间" className="absolute inset-0 z-50 grid place-items-center bg-black/15 backdrop-blur-[1px]">
      <div className="w-[460px] max-w-[calc(100vw-2rem)] rounded-2xl border border-black/12 bg-white p-5 shadow-[0_20px_48px_rgba(15,23,42,0.22)]">
        <p className="text-sm text-slate-800">删除这个空间？</p>
        <p className="mt-2 line-clamp-2 text-xs text-slate-600">{props.spaceTitle}</p>
        <p className="mt-1 text-xs text-slate-600">删除后不可恢复，轨道、节点与关联会一并清理。</p>
        <div className="mt-4 flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="rounded-full border border-black/12 text-slate-700"
            onClick={props.onCancel}
          >
            取消
          </Button>
          <Button type="button" size="sm" className="rounded-full bg-red-600 text-slate-50 hover:bg-red-500" onClick={props.onConfirm}>
            确认删除
          </Button>
        </div>
      </div>
    </div>
  );
}
