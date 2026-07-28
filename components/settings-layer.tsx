"use client";

import { memo, useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode } from "react";

import type { QueuedMutation } from "@/components/offline-store";
import type {
  BackupPreviewSummary,
  SyncRepairItemSummary,
  SyncRepairSummary
} from "@/components/time-archive/sync-diagnostics-types";
import type { SyncSummary } from "@/components/time-archive/sync-status";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

import { copyText } from "@/components/zhihuo-model";
import { onSubmitEnter } from "@/lib/input-events";
import { cn } from "@/lib/utils";
import {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_PROVIDER,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  clearAiApiSettings,
  getAiProviderDefaults,
  loadAiApiSettings,
  loadAiRemoteProcessingConsent,
  saveAiApiSettings,
  saveAiRemoteProcessingConsent,
  type AiProvider
} from "@/lib/ai-settings";
import {
  MAX_LETTER_AUTHOR_LENGTH,
  loadLetterAuthorName,
  normalizeLetterAuthorName,
  saveLetterAuthorName
} from "@/lib/letter-settings";

const FEATURED_TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "中国标准时间 (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "日本标准时间 (UTC+09:00)" },
  { value: "America/Los_Angeles", label: "太平洋时间 (UTC-08:00/-07:00)" },
  { value: "America/New_York", label: "美东时间 (UTC-05:00/-04:00)" },
  { value: "Europe/London", label: "伦敦时间 (UTC+00:00/+01:00)" }
];

const SETTINGS_SECTIONS = [
  { id: "settings-basic", label: "基础" },
  { id: "settings-ai", label: "AI" },
  { id: "settings-data", label: "数据" },
  { id: "settings-sync", label: "同步" }
];

function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-[var(--radius)] border bg-card text-card-foreground shadow", className)} {...props} />;
}

function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />;
}

function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("font-semibold leading-none tracking-[var(--tracking-body)]", className)} {...props} />;
}

function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-[var(--text-meta)] leading-6 text-slate-600", className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
}

function SettingCard({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <Card
      className={cn(
        "border-slate-400/20 bg-[rgba(250,248,244,0.88)] text-slate-900 shadow-[0_1px_2px_rgba(15,23,42,0.04),0_12px_32px_rgba(71,55,40,0.035)] backdrop-blur-[2px]",
        className
      )}
      {...props}
    />
  );
}

function SectionBlock(props: { id: string; title: string; description: string; children: ReactNode }) {
  const sectionIndex = SETTINGS_SECTIONS.findIndex((section) => section.id === props.id) + 1;
  return (
    <section id={props.id} className="scroll-mt-28 lg:scroll-mt-5" aria-labelledby={`${props.id}-title`}>
      <div className="mb-4 flex items-start gap-3 px-1">
        <span aria-hidden="true" className="mt-0.5 text-xs tabular-nums tracking-[var(--tracking-meta)] text-slate-600">
          {String(sectionIndex).padStart(2, "0")}
        </span>
        <div className="min-w-0">
          <h2 id={`${props.id}-title`} className="text-[var(--text-title)] font-medium tracking-[var(--tracking-body)] text-slate-900">
            {props.title}
          </h2>
          <p className="mt-1 text-[var(--text-meta)] leading-6 text-slate-600">{props.description}</p>
        </div>
      </div>
      <div className="grid gap-3">{props.children}</div>
    </section>
  );
}

function FieldShell(props: { label: string; description?: string; className?: string; children: ReactNode }) {
  return (
    <label
      className={cn(
        "grid gap-2 rounded-[var(--radius)] border border-slate-300/80 bg-white/90 px-3.5 py-3 transition-[border-color,box-shadow] focus-within:border-slate-500/60 focus-within:shadow-[0_0_0_3px_rgba(100,116,139,0.08)]",
        props.className
      )}
    >
      <span className="text-sm font-medium text-slate-700">{props.label}</span>
      {props.description ? <span className="text-xs leading-5 text-slate-600">{props.description}</span> : null}
      {props.children}
    </label>
  );
}

function PillButton({
  active,
  danger,
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; danger?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "min-h-11 rounded-full border px-3.5 py-2 text-xs transition-[color,background-color,border-color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35 disabled:pointer-events-none disabled:opacity-45 sm:min-h-9 sm:py-1.5",
        active
          ? "border-slate-800 bg-slate-900 text-white"
          : danger
            ? "border-red-400/40 bg-red-100/70 text-red-800"
            : "border-slate-300 bg-white text-slate-600 hover:border-slate-400/70 hover:text-slate-900",
        className
      )}
      {...props}
    />
  );
}

function SettingsLayerComponent(props: {
  timezone: string;
  setTimezone: (timezone: string) => void;
  activeThinkingSpaces: Array<{ id: string; title: string }>;
  fixedTopSpacesEnabled: boolean;
  fixedTopSpaceIds: string[];
  setFixedTopSpacesEnabled: (enabled: boolean) => void;
  setFixedTopSpaceIds: (ids: string[]) => void;
  showThinkingDimensions: boolean;
  setShowThinkingDimensions: (enabled: boolean) => void;
  nightPaperEnabled: boolean;
  setNightPaperEnabled: (enabled: boolean) => void;
  autoSealRemindersDisabled: boolean;
  setAutoSealRemindersDisabled: (disabled: boolean) => void;
  sessionEmail: string | null;
  cloudSyncEnabled: boolean;
  cloudSyncReady: boolean;
  onSystemExport: (options: { includeLife: boolean; includeThinking: boolean }) => Promise<string | null>;
  onSystemBackup: () => Promise<string | null>;
  onSystemImport: (
    envelope: { payload: unknown; checksum: string },
    mode: "validate" | "replace"
  ) => Promise<{ ok: boolean; message: string }>;
  onOpenAuth: () => void;
  onClearAll: () => void;
  onLogout: () => void;
  syncStatus: {
    syncSummary: SyncSummary;
    modeLabel: string;
    phase: string;
    localRevision: number | null;
    cloudRevision: number | null;
    cloudServerTime: string | null;
    lastCloudCheckedAt: string | null;
    pendingMutationCount: number;
    hasLocalChanges: boolean;
    hasUnqueuedLocalChanges: boolean;
    offlineMediaPendingCount: number;
    lastSyncedAt: string | null;
    nextRetryAt: number | null;
    warning: string | null;
    latestBackup: BackupPreviewSummary | null;
    lastRepairSummary: SyncRepairSummary | null;
  };
  syncDiagnosticsReport: string;
  syncRepairing: boolean;
  onManualPullCloud: () => Promise<{ ok: boolean; error?: string }>;
  onManualUploadLocal: () => Promise<{ ok: boolean; error?: string }>;
  onManualOverwriteCloud: () => Promise<{ ok: boolean; error?: string }>;
  onPreviewLatestSyncBackup: () => Promise<{ ok: boolean; error?: string }>;
  onExitBackupPreview: () => Promise<void> | void;
  onOverwriteCloudWithBackupPreview: () => Promise<{ ok: boolean; error?: string }>;
  onSyncRepair: () => Promise<{ ok: boolean; error?: string }>;
  deadLetterMutations: QueuedMutation[];
  onDismissDeadLetter: (mutationId: string) => Promise<void> | void;
  unmergedItems: SyncRepairItemSummary[];
  onIgnoreUnmergedItem: (itemId: string) => Promise<void> | void;
  backupPreview: BackupPreviewSummary | null;
  showNotice: (message: string) => void;
}) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [includeLife, setIncludeLife] = useState(true);
  const [includeThinking, setIncludeThinking] = useState(true);
  const [exportText, setExportText] = useState("");
  const [loadingExport, setLoadingExport] = useState(false);
  const [loadingBackup, setLoadingBackup] = useState(false);
  const [importCandidate, setImportCandidate] = useState<{ payload: unknown; checksum: string; fileName: string } | null>(null);
  const [importStatus, setImportStatus] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  const [aiProvider, setAiProvider] = useState<AiProvider>(DEFAULT_AI_PROVIDER);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_DEEPSEEK_BASE_URL);
  const [confirmOverwriteCloud, setConfirmOverwriteCloud] = useState(false);
  const [confirmBackupOverwrite, setConfirmBackupOverwrite] = useState(false);
  const [aiModel, setAiModel] = useState(DEFAULT_DEEPSEEK_MODEL);
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [aiRemoteConsent, setAiRemoteConsent] = useState(false);
  const [letterAuthorName, setLetterAuthorName] = useState("");
  const [advancedSyncOpen, setAdvancedSyncOpen] = useState(false);
  const [timezoneDraft, setTimezoneDraft] = useState(props.timezone);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const timezoneOptions = useMemo(() => {
    const supportedValuesOf = (
      Intl as typeof Intl & { supportedValuesOf?: (key: "timeZone") => string[] }
    ).supportedValuesOf;
    const allTimezones = supportedValuesOf?.("timeZone") ?? FEATURED_TIMEZONE_OPTIONS.map((item) => item.value);
    return Array.from(new Set([props.timezone, ...FEATURED_TIMEZONE_OPTIONS.map((item) => item.value), ...allTimezones]));
  }, [props.timezone]);

  useEffect(() => setTimezoneDraft(props.timezone), [props.timezone]);

  const commitTimezone = () => {
    try {
      new Intl.DateTimeFormat("zh-CN", { timeZone: timezoneDraft }).format();
      props.setTimezone(timezoneDraft);
      props.showNotice("时区已更新");
    } catch {
      setTimezoneDraft(props.timezone);
      props.showNotice("请输入有效的 IANA 时区，例如 Asia/Shanghai");
    }
  };

  const pinnedSet = useMemo(() => new Set(props.fixedTopSpaceIds), [props.fixedTopSpaceIds]);

  const syncDotClass =
    props.syncStatus.syncSummary.tone === "good"
      ? "bg-emerald-500"
      : props.syncStatus.syncSummary.tone === "working"
        ? "bg-sky-500"
        : props.syncStatus.syncSummary.tone === "warning"
          ? "bg-amber-500"
          : "bg-slate-400";
  const lastSyncText = props.syncStatus.lastSyncedAt ? new Date(props.syncStatus.lastSyncedAt).toLocaleString("zh-CN") : "暂无同步记录";

  const getUnmergedItemText = (item: SyncRepairItemSummary) => {
    const rawText = item.payload.raw_text;
    if (typeof rawText === "string" && rawText.trim()) return rawText;
    const rawTextCamel = item.payload.rawText;
    if (typeof rawTextCamel === "string" && rawTextCamel.trim()) return rawTextCamel;
    return "未提供可读内容";
  };

  const getUnmergedReasonText = (reason: string) => {
    if (reason === "question_add_invalid") return "内容未合入：内容过短或不符合规则";
    return `内容未合入：${reason || "云端未接受"}`;
  };

  const buildUnmergedCopyText = (item: SyncRepairItemSummary) =>
    JSON.stringify(
      {
        raw_text: getUnmergedItemText(item),
        reason: item.reason,
        reason_text: getUnmergedReasonText(item.reason),
        op: item.op,
        createdAt: item.createdAt,
        clientMutationId: item.clientMutationId,
        payload: item.payload
      },
      null,
      2
    );

  useEffect(() => {
    const settings = loadAiApiSettings();
    setAiProvider(settings.provider);
    setAiApiKey(settings.apiKey);
    setAiBaseUrl(settings.baseUrl);
    setAiModel(settings.model);
    setAiRemoteConsent(loadAiRemoteProcessingConsent());
    setLetterAuthorName(loadLetterAuthorName());
  }, []);

  const commitLetterAuthorName = () => {
    const next = normalizeLetterAuthorName(letterAuthorName);
    if (next === loadLetterAuthorName()) {
      setLetterAuthorName(next);
      return;
    }
    saveLetterAuthorName(next);
    setLetterAuthorName(next);
    props.showNotice(next ? "信笺落款已更新" : "信笺已改为不署名");
  };

  useEffect(() => {
    if (!props.backupPreview) setConfirmBackupOverwrite(false);
  }, [props.backupPreview]);

  const saveAiSettings = () => {
    saveAiApiSettings({
      provider: aiProvider,
      apiKey: aiApiKey,
      baseUrl: aiBaseUrl,
      model: aiModel
    });
    saveAiRemoteProcessingConsent(aiRemoteConsent);
    props.showNotice("AI API 设置已保存");
  };

  const clearAiSettings = () => {
    clearAiApiSettings();
    setAiProvider(DEFAULT_AI_PROVIDER);
    setAiApiKey("");
    setAiBaseUrl(DEFAULT_DEEPSEEK_BASE_URL);
    setAiModel(DEFAULT_DEEPSEEK_MODEL);
    setAiRemoteConsent(false);
    saveAiRemoteProcessingConsent(false);
    props.showNotice("AI API 设置已清空");
  };

  const changeAiProvider = (provider: AiProvider) => {
    setAiProvider(provider);
    const defaults = getAiProviderDefaults(provider);
    setAiBaseUrl(defaults.baseUrl);
    setAiModel(defaults.model);
  };

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

  const downloadFullBackup = () => {
    if (loadingBackup) return;
    setLoadingBackup(true);
    void (async () => {
      const text = await props.onSystemBackup();
      setLoadingBackup(false);
      if (!text) {
        props.showNotice("完整备份生成失败，请确认已登录");
        return;
      }
      downloadTextFile(text, `zhihuo-backup-${new Date().toISOString().slice(0, 10)}.json`, "application/json");
      props.showNotice("完整备份已下载");
    })();
  };

  const selectImportFile = (file: File | null) => {
    setImportCandidate(null);
    setConfirmImport(false);
    if (!file) return;
    setImportBusy(true);
    setImportStatus("正在校验备份…");
    void (async () => {
      try {
        const parsed = JSON.parse(await file.text()) as { payload?: unknown; checksum?: unknown };
        if (!parsed || typeof parsed !== "object" || typeof parsed.checksum !== "string" || !parsed.payload) {
          throw new Error("文件不是知惑完整备份");
        }
        const envelope = { payload: parsed.payload, checksum: parsed.checksum };
        const result = await props.onSystemImport(envelope, "validate");
        if (!result.ok) throw new Error(result.message);
        setImportCandidate({ ...envelope, fileName: file.name });
        setImportStatus(`校验通过：${file.name}`);
      } catch (error) {
        setImportStatus(error instanceof Error ? error.message : "备份校验失败");
      } finally {
        setImportBusy(false);
        if (importInputRef.current) importInputRef.current.value = "";
      }
    })();
  };

  const replaceWithImport = () => {
    if (!importCandidate || !confirmImport || importBusy) return;
    setImportBusy(true);
    setImportStatus("正在创建本机保护备份并导入…");
    void (async () => {
      const result = await props.onSystemImport(
        { payload: importCandidate.payload, checksum: importCandidate.checksum },
        "replace"
      );
      setImportBusy(false);
      setImportStatus(result.message);
      if (!result.ok) return;
      setImportCandidate(null);
      setConfirmImport(false);
    })();
  };

  const runSyncRepair = () => {
    if (props.syncRepairing || props.backupPreview) return;
    void (async () => {
      const result = await props.onSyncRepair();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  const runManualPullCloud = () => {
    if (props.syncRepairing || props.backupPreview) return;
    void (async () => {
      const result = await props.onManualPullCloud();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  const runManualUploadLocal = () => {
    if (props.syncRepairing || props.backupPreview) return;
    void (async () => {
      const result = await props.onManualUploadLocal();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  const runManualOverwriteCloud = () => {
    if (props.syncRepairing || props.backupPreview) return;
    if (!confirmOverwriteCloud) {
      setConfirmOverwriteCloud(true);
      props.showNotice("再次点击“本地覆盖云端”确认执行");
      return;
    }
    setConfirmOverwriteCloud(false);
    void (async () => {
      const result = await props.onManualOverwriteCloud();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  const runPreviewLatestBackup = () => {
    if (props.syncRepairing) return;
    void (async () => {
      const result = await props.onPreviewLatestSyncBackup();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  const runOverwriteCloudWithBackupPreview = () => {
    if (props.syncRepairing || !props.backupPreview) return;
    if (!confirmBackupOverwrite) {
      setConfirmBackupOverwrite(true);
      props.showNotice("再次点击“用此备份覆盖云端”确认执行");
      return;
    }
    setConfirmBackupOverwrite(false);
    void (async () => {
      const result = await props.onOverwriteCloudWithBackupPreview();
      if (!result.ok && result.error) props.showNotice(result.error);
    })();
  };

  return (
    <div data-settings-layer="true" className="h-full overflow-y-auto overscroll-contain px-4 pb-12 pt-4 md:px-8">
      <div className="mx-auto grid w-full max-w-6xl gap-5 lg:grid-cols-[180px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <nav aria-label="设置分区" className="sticky top-4 rounded-[var(--radius)] border border-slate-400/20 bg-[rgba(250,248,244,0.78)] p-2 text-slate-700 shadow-sm backdrop-blur-sm">
            <p className="px-3 py-2 text-xs font-medium tracking-[var(--tracking-display)] text-slate-600">设置</p>
            <div className="grid gap-1">
              {SETTINGS_SECTIONS.map((section) => (
                <a key={section.id} href={`#${section.id}`} className="rounded-[var(--radius)] px-3 py-2 text-sm transition-colors hover:bg-white/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/30">
                  <span className="block text-slate-900">{section.label}</span>
                </a>
              ))}
            </div>
          </nav>
        </aside>

        <div className="grid min-w-0 gap-8">
          <header className="px-1 pb-1 pt-2">
            <p className="text-xs tracking-[var(--tracking-display)] text-slate-600">PREFERENCES</p>
            <h1 className="mt-2 text-[var(--text-display)] font-medium tracking-[var(--tracking-body)] text-slate-900">设置</h1>
          </header>

          <nav
            aria-label="设置分区"
            className="sticky top-0 z-20 -mx-4 flex gap-2 overflow-x-auto border-y border-slate-300/40 bg-[rgba(239,235,228,0.92)] px-4 py-2.5 shadow-[0_4px_14px_rgba(71,55,40,0.04)] backdrop-blur-md [scrollbar-width:none] lg:hidden"
          >
            {SETTINGS_SECTIONS.map((section) => (
              <a
                key={section.id}
                href={`#${section.id}`}
                className="inline-flex min-h-11 shrink-0 items-center rounded-full border border-slate-400/25 bg-white/65 px-4 text-xs tracking-[var(--tracking-meta)] text-slate-700 transition-colors hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/35"
              >
                {section.label}
              </a>
            ))}
          </nav>

          <SettingCard className="bg-[rgba(250,248,244,0.58)] shadow-none">
            <CardHeader className="flex-row items-baseline justify-between space-y-0 p-4 md:px-5 md:py-4">
              <div>
                <CardTitle className="text-sm font-medium">当前状态</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="grid gap-3 px-4 pb-4 pt-0 sm:grid-cols-2 md:px-5 md:pb-5">
              <div className="rounded-[var(--radius)] border border-slate-300/70 bg-white/70 px-3 py-3">
                <p className="text-[var(--text-caption)] tracking-[var(--tracking-meta)] text-slate-600">账号</p>
                <p className="mt-1 truncate text-sm font-medium text-slate-900">{props.sessionEmail ?? "本地离线"}</p>
              </div>
              <div className="rounded-[var(--radius)] border border-slate-300/70 bg-white/70 px-3 py-3">
                <p className="text-[var(--text-caption)] tracking-[var(--tracking-meta)] text-slate-600">同步</p>
                <div className="mt-1 flex items-center gap-2">
                  <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-full ${syncDotClass}`} />
                  <p className="text-sm font-medium text-slate-900">{props.syncStatus.syncSummary.label}</p>
                </div>
              </div>
            </CardContent>
          </SettingCard>

          <SectionBlock id="settings-basic" title="基础" description="整理时间显示、想一想辅助信息和顶部空间。">
            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>时区设置</CardTitle>
                <CardDescription>用于时间层和想一想的本地显示。</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <FieldShell label="时区">
                  <input
                    value={timezoneDraft}
                    list="zhihuo-timezones"
                    placeholder="搜索城市或输入 IANA 时区"
                    className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                    onChange={(event) => setTimezoneDraft(event.target.value)}
                    onBlur={commitTimezone}
                    onKeyDown={onSubmitEnter(commitTimezone)}
                  />
                  <datalist id="zhihuo-timezones">
                    {timezoneOptions.map((timezone) => <option key={timezone} value={timezone} />)}
                  </datalist>
                </FieldShell>
              </CardContent>
            </SettingCard>

            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>信笺落款</CardTitle>
                <CardDescription>封存信笺右下角的署名，只保存在本机。留空则不署名。</CardDescription>
              </CardHeader>
              <CardContent className="px-4 pb-4 pt-0">
                <FieldShell label="落款" description={`最多 ${MAX_LETTER_AUTHOR_LENGTH} 个字`}>
                  <input
                    value={letterAuthorName}
                    maxLength={MAX_LETTER_AUTHOR_LENGTH}
                    placeholder="留空则不署名"
                    className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                    onChange={(event) => setLetterAuthorName(event.target.value)}
                    onBlur={commitLetterAuthorName}
                    onKeyDown={onSubmitEnter(commitLetterAuthorName)}
                  />
                </FieldShell>
              </CardContent>
            </SettingCard>

            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>想一想偏好</CardTitle>
                <CardDescription>控制进阶思考里的辅助信息和封存提醒。</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 px-4 pb-4 pt-0 md:grid-cols-2">
                <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={props.showThinkingDimensions}
                    onChange={(event) => {
                      props.setShowThinkingDimensions(event.target.checked);
                      props.showNotice(event.target.checked ? "思考维度已显示" : "思考维度已隐藏");
                    }}
                    className="mt-0.5 h-4 w-4 accent-slate-800"
                  />
                  <span>
                    <span className="block">显示思考维度</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">默认隐藏；打开后只在节点辅助信息里显示。</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={props.nightPaperEnabled}
                    onChange={(event) => {
                      props.setNightPaperEnabled(event.target.checked);
                      props.showNotice(event.target.checked ? "夜间纸色已开启" : "夜间纸色已关闭");
                    }}
                    className="mt-0.5 h-4 w-4 accent-slate-800"
                  />
                  <span>
                    <span className="block">夜间纸色</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">降低“想一想”的纸面亮度，正文对比度保持不变。</span>
                  </span>
                </label>
                <label className="flex items-start gap-3 rounded-lg border border-slate-300 bg-white px-3 py-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={!props.autoSealRemindersDisabled}
                    onChange={(event) => {
                      props.setAutoSealRemindersDisabled(!event.target.checked);
                      props.showNotice(event.target.checked ? "自动封存提醒已开启" : "自动封存提醒已关闭");
                    }}
                    className="mt-0.5 h-4 w-4 accent-slate-800"
                  />
                  <span>
                    <span className="block">自动封存提醒</span>
                    <span className="mt-1 block text-xs leading-5 text-slate-600">安静两周后先提醒，不再自动替你封存。</span>
                  </span>
                </label>
              </CardContent>
            </SettingCard>

            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>想一想顶部空间</CardTitle>
                <CardDescription>固定显示三个空间，不会被最新修改的空间刷掉。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-0">
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
                  <p className="text-xs text-slate-600">仅可选择活跃空间（最多 3 个，按选中顺序显示）</p>
                  <div className="flex flex-wrap gap-2">
                    {props.activeThinkingSpaces.length ? (
                      props.activeThinkingSpaces.map((space) => {
                        const selected = pinnedSet.has(space.id);
                        const order = props.fixedTopSpaceIds.indexOf(space.id);
                        return (
                          <PillButton
                            key={space.id}
                            active={selected}
                            className="max-w-full truncate"
                            onClick={() => {
                              if (!selected && props.fixedTopSpaceIds.length >= 3) {
                                props.showNotice("最多固定 3 个空间");
                                return;
                              }
                              const nextIds = selected ? props.fixedTopSpaceIds.filter((id) => id !== space.id) : [...props.fixedTopSpaceIds, space.id];
                              props.setFixedTopSpaceIds(nextIds);
                            }}
                          >
                            {selected ? `${order + 1}. ` : ""}
                            {space.title}
                          </PillButton>
                        );
                      })
                    ) : (
                      <p className="text-xs text-slate-600">暂无活跃空间</p>
                    )}
                  </div>
                </div>
              </CardContent>
            </SettingCard>
          </SectionBlock>

          <SectionBlock id="settings-ai" title="AI" description="配置思考星图与封存信笺凝练使用的模型接口。">
            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>AI 策展 API</CardTitle>
                <CardDescription>支持 DeepSeek 与 OpenAI 兼容接口，API Key 只保存在本机。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4 px-4 pb-4 pt-0">
                <div className="grid gap-3 rounded-lg border border-slate-300 bg-white p-3">
                  <FieldShell label="服务商" className="border-0 p-0">
                    <select
                      value={aiProvider}
                      onChange={(event) => changeAiProvider(event.target.value as AiProvider)}
                      className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                    >
                      {AI_PROVIDER_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </FieldShell>
                  <FieldShell label="API Key" className="border-0 p-0">
                    <div className="flex gap-2">
                      <input
                        type={aiKeyVisible ? "text" : "password"}
                        value={aiApiKey}
                        autoComplete="off"
                        spellCheck={false}
                        placeholder="sk-..."
                        onChange={(event) => setAiApiKey(event.target.value)}
                        className="h-11 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                      />
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-11 shrink-0 rounded-md border border-slate-300 bg-white px-3 text-slate-700 sm:h-10"
                        onClick={() => setAiKeyVisible((visible) => !visible)}
                      >
                        {aiKeyVisible ? "隐藏" : "显示"}
                      </Button>
                    </div>
                  </FieldShell>
                  <FieldShell label="模型" className="border-0 p-0">
                    <input
                      value={aiModel}
                      onChange={(event) => setAiModel(event.target.value)}
                      placeholder={`例如 ${getAiProviderDefaults(aiProvider).model}`}
                      className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                    />
                  </FieldShell>
                  <FieldShell label="Base URL" className="border-0 p-0">
                    <input
                      type="url"
                      value={aiBaseUrl}
                      onChange={(event) => setAiBaseUrl(event.target.value)}
                      placeholder={getAiProviderDefaults(aiProvider).baseUrl}
                      className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50 sm:h-10"
                    />
                  </FieldShell>
                  <label className="flex items-start gap-3 rounded-md border border-amber-300/70 bg-amber-50 px-3 py-3 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={aiRemoteConsent}
                      onChange={(event) => setAiRemoteConsent(event.target.checked)}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-slate-900"
                    />
                    <span>
                      <span className="block font-medium">允许按次使用第三方 AI</span>
                      <span className="mt-1 block text-xs leading-5 text-slate-600">
                        仅当你在具体功能中再次选择“本次使用 AI”时，当前疑问、思考节点和札记才会发送给所选模型服务商处理。关闭后始终使用本机凝练。
                      </span>
                    </span>
                  </label>
                </div>
              </CardContent>
              <CardFooter className="flex-wrap gap-2 px-4 pb-4 pt-0">
                <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={saveAiSettings}>
                  保存 API 设置
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                  onClick={() => {
                    const defaults = getAiProviderDefaults(aiProvider);
                    setAiBaseUrl(defaults.baseUrl);
                    setAiModel(defaults.model);
                    props.showNotice("已恢复当前服务商默认项");
                  }}
                >
                  恢复默认
                </Button>
                <Button type="button" size="sm" variant="ghost" className="rounded-full border border-red-400/40 bg-red-100/70 text-red-800" onClick={clearAiSettings}>
                  清空 Key
                </Button>
              </CardFooter>
            </SettingCard>
          </SectionBlock>

          <SectionBlock id="settings-data" title="数据" description="导出本地内容，或执行不可恢复的清空操作。">
            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>可恢复备份</CardTitle>
                <CardDescription>完整 JSON 备份包含时间层、思考空间、随记、星图关系和图片，可在其他设备校验后恢复。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="sr-only"
                  onChange={(event) => selectImportFile(event.target.files?.[0] ?? null)}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                    disabled={loadingBackup}
                    onClick={downloadFullBackup}
                  >
                    {loadingBackup ? "生成中…" : "下载完整备份"}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                    disabled={importBusy}
                    onClick={() => importInputRef.current?.click()}
                  >
                    选择备份导入
                  </Button>
                </div>
                {importStatus ? (
                  <p role="status" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs leading-5 text-slate-700">
                    {importStatus}
                  </p>
                ) : null}
                {importCandidate ? (
                  <div className="space-y-3 rounded-lg border border-amber-300 bg-amber-50 p-3">
                    <label className="flex items-start gap-2 text-sm text-amber-950">
                      <input
                        type="checkbox"
                        checked={confirmImport}
                        onChange={(event) => setConfirmImport(event.target.checked)}
                        className="mt-0.5 h-4 w-4 accent-amber-900"
                      />
                      <span>我确认用此备份替换当前账号数据。系统会先创建本机保护备份，导入失败不会清理现有工作副本。</span>
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full bg-amber-950 text-white hover:bg-amber-900"
                      disabled={!confirmImport || importBusy}
                      onClick={replaceWithImport}
                    >
                      {importBusy ? "导入中…" : "确认恢复此备份"}
                    </Button>
                  </div>
                ) : null}
              </CardContent>
            </SettingCard>

            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>全量导出</CardTitle>
                <CardDescription>仅支持 Markdown 导出，可选时间层 / 想一想。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                <div className="flex flex-wrap items-center gap-4 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
                  <label className="inline-flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={includeLife} onChange={(event) => setIncludeLife(event.target.checked)} className="h-4 w-4 accent-slate-800" />
                    时间层
                  </label>
                  <label className="inline-flex items-center gap-2 text-slate-700">
                    <input type="checkbox" checked={includeThinking} onChange={(event) => setIncludeThinking(event.target.checked)} className="h-4 w-4 accent-slate-800" />
                    想一想
                  </label>
                </div>
                <Textarea
                  readOnly
                  data-zh-input="multiline"
                  value={loadingExport ? "导出生成中..." : exportText}
                  className="min-h-[220px] resize-y border-slate-300 bg-white font-mono text-xs leading-[1.65] text-slate-700 [overflow-wrap:anywhere]"
                />
              </CardContent>
              <CardFooter className="flex-wrap gap-2 px-4 pb-4 pt-0">
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
            </SettingCard>

            <Card className="border-red-400/35 bg-red-50/90 text-red-900 shadow-sm">
              <CardHeader className="p-4">
                <CardTitle>清空数据</CardTitle>
                <CardDescription className="text-red-800/75">清空后无法恢复，请谨慎操作。</CardDescription>
              </CardHeader>
              <CardFooter className="flex-wrap gap-2 px-4 pb-4 pt-0">
                {!confirmClear ? (
                  <Button type="button" size="sm" variant="ghost" className="rounded-full border border-red-400/40 bg-red-100/70 text-red-800" onClick={() => setConfirmClear(true)}>
                    清空全部
                  </Button>
                ) : (
                  <>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={() => setConfirmClear(false)}>
                      取消
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-red-500/50 bg-red-200/60 text-red-900" onClick={props.onClearAll}>
                      确认清空
                    </Button>
                  </>
                )}
              </CardFooter>
            </Card>
          </SectionBlock>

          <SectionBlock id="settings-sync" title="同步" description="查看账号、云端同步状态和高级诊断工具。">
            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>账号 / 会话</CardTitle>
                <CardDescription>
                  {props.sessionEmail
                    ? props.cloudSyncReady
                      ? "当前设备已绑定账号，云端同步已开启。"
                      : props.cloudSyncEnabled
                        ? "当前设备已绑定账号，同步正在准备或等待本地数据绑定。"
                        : "当前设备已绑定账号。"
                    : "当前是本地离线模式，登录后可把本地数据绑定到账号。"}
                </CardDescription>
              </CardHeader>
              <CardFooter className="flex-wrap gap-3 px-4 pb-4 pt-0">
                {props.sessionEmail ? (
                  <>
                    <span className="min-w-0 break-all text-sm text-slate-700">{props.sessionEmail}</span>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={props.onLogout}>
                      退出登录
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={props.onOpenAuth}>
                    登录 / 注册
                  </Button>
                )}
              </CardFooter>
            </SettingCard>

            <SettingCard>
              <CardHeader className="p-4">
                <CardTitle>数据同步</CardTitle>
                <CardDescription>系统会自动保存并同步改动，通常不需要手动处理。</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 px-4 pb-4 pt-0">
                <div className="rounded-xl border border-slate-300 bg-white px-4 py-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <span className={`h-2.5 w-2.5 rounded-full ${syncDotClass}`} />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{props.syncStatus.syncSummary.label}</p>
                        <p className="mt-1 text-xs leading-5 text-slate-600">{props.syncStatus.modeLabel}</p>
                      </div>
                    </div>
                    <div className="text-left text-xs leading-5 text-slate-600 sm:text-right">
                      <p>上次同步：{lastSyncText}</p>
                    </div>
                  </div>
                </div>
                {props.syncStatus.warning ? <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.syncStatus.warning}</div> : null}
                {props.backupPreview ? (
                  <div className="rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                    正在预览 {new Date(props.backupPreview.createdAt).toLocaleString("zh-CN")} 的本机备份。预览不会自动同步，也不会替换当前账号数据。
                  </div>
                ) : null}
              </CardContent>
              <CardFooter className="px-4 pb-4 pt-0">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                  onClick={() => setAdvancedSyncOpen((open) => !open)}
                >
                  {advancedSyncOpen ? "收起高级同步诊断" : "高级同步诊断"}
                </Button>
              </CardFooter>
            </SettingCard>

            {advancedSyncOpen ? (
              <>
                <SettingCard>
                  <CardHeader className="p-4">
                    <CardTitle>同步与修复</CardTitle>
                    <CardDescription>用于查看当前同步健康度，并在发现双端不一致时执行云端优先的同步刷新。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4 pt-0">
                    <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700 md:grid-cols-2">
                      <div>
                        <p className="text-xs text-slate-600">当前同步模式</p>
                        <p className="mt-1">{props.syncStatus.modeLabel}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">同步阶段</p>
                        <p className="mt-1">{props.syncStatus.phase}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">本地 revision</p>
                        <p className="mt-1">{props.syncStatus.localRevision ?? "未记录"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">云端 revision</p>
                        <p className="mt-1">{props.syncStatus.cloudRevision ?? "未获取"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">待同步改动</p>
                        <p className="mt-1">{props.syncStatus.pendingMutationCount > 0 ? props.syncStatus.pendingMutationCount : props.syncStatus.hasLocalChanges ? "有本地改动" : 0}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">同步异常</p>
                        <p className="mt-1">{props.deadLetterMutations.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">历史未合入</p>
                        <p className="mt-1">{props.unmergedItems.length}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">最后成功同步</p>
                        <p className="mt-1">{props.syncStatus.lastSyncedAt ? new Date(props.syncStatus.lastSyncedAt).toLocaleString("zh-CN") : "暂无"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">上次检查云端</p>
                        <p className="mt-1">{props.syncStatus.lastCloudCheckedAt ? new Date(props.syncStatus.lastCloudCheckedAt).toLocaleString("zh-CN") : "暂无"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">云端时间</p>
                        <p className="mt-1">{props.syncStatus.cloudServerTime ? new Date(props.syncStatus.cloudServerTime).toLocaleString("zh-CN") : "暂无"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">未上传媒体</p>
                        <p className="mt-1">{props.syncStatus.offlineMediaPendingCount}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">下次自动重试</p>
                        <p className="mt-1">{typeof props.syncStatus.nextRetryAt === "number" && Number.isFinite(props.syncStatus.nextRetryAt) ? new Date(props.syncStatus.nextRetryAt).toLocaleString("zh-CN") : "无需重试"}</p>
                      </div>
                      <div>
                        <p className="text-xs text-slate-600">最近本地备份</p>
                        <p className="mt-1">{props.syncStatus.latestBackup ? new Date(props.syncStatus.latestBackup.createdAt).toLocaleString("zh-CN") : "暂无"}</p>
                      </div>
                    </div>
                    {props.syncStatus.hasUnqueuedLocalChanges ? <div className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-900">本地存在未入队改动，已暂停自动云端覆盖，避免丢失本地内容。</div> : null}
                    {props.syncStatus.warning ? <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">{props.syncStatus.warning}</div> : null}
                    {props.syncStatus.lastRepairSummary ? (
                      <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
                        最近一次同步刷新：{new Date(props.syncStatus.lastRepairSummary.finishedAt).toLocaleString("zh-CN")}，重放 {props.syncStatus.lastRepairSummary.replayedCount} 条，剩余待同步{" "}
                        {props.syncStatus.lastRepairSummary.pendingCount} 条，同步异常 {props.syncStatus.lastRepairSummary.deadLetterCount} 条。
                      </div>
                    ) : null}
                    {props.backupPreview ? (
                      <div className="rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                        正在预览 {new Date(props.backupPreview.createdAt).toLocaleString("zh-CN")} 的本机备份。预览不会自动同步，也不会替换当前账号数据。
                      </div>
                    ) : null}
                  </CardContent>
                  <CardFooter className="flex flex-wrap items-center gap-2 px-4 pb-4 pt-0">
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={runManualPullCloud} disabled={props.syncRepairing || Boolean(props.backupPreview)}>
                      拉取云端
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={runManualUploadLocal} disabled={props.syncRepairing || Boolean(props.backupPreview)}>
                      上传本地
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-red-300/70 bg-red-50 text-red-800 disabled:opacity-40" onClick={runManualOverwriteCloud} disabled={props.syncRepairing || Boolean(props.backupPreview)}>
                      {confirmOverwriteCloud ? "确认覆盖云端" : "本地覆盖云端"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700 disabled:opacity-40" onClick={runPreviewLatestBackup} disabled={props.syncRepairing || Boolean(props.backupPreview) || !props.syncStatus.latestBackup}>
                      查看本机备份
                    </Button>
                    {props.backupPreview ? (
                      <>
                        <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={() => void props.onExitBackupPreview()} disabled={props.syncRepairing}>
                          退出预览
                        </Button>
                        <Button type="button" size="sm" variant="ghost" className="rounded-full border border-red-300/70 bg-red-50 text-red-800 disabled:opacity-40" onClick={runOverwriteCloudWithBackupPreview} disabled={props.syncRepairing}>
                          {confirmBackupOverwrite ? "确认覆盖云端" : "用此备份覆盖云端"}
                        </Button>
                      </>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={runSyncRepair} disabled={props.syncRepairing || Boolean(props.backupPreview)}>
                      {props.syncRepairing ? "同步刷新中..." : "同步刷新"}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={() => void copyText(props.syncDiagnosticsReport, () => props.showNotice("已复制同步诊断"))}>
                      复制诊断
                    </Button>
                  </CardFooter>
                </SettingCard>

                <Card className="border-sky-400/30 bg-sky-50/90 text-sky-950 shadow-sm">
                  <CardHeader className="p-4">
                    <CardTitle>历史未合入内容</CardTitle>
                    <CardDescription className="text-sky-900/70">这些历史操作未被云端接受，已隔离，不影响当前同步。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4 pt-0">
                    {props.unmergedItems.length ? (
                      props.unmergedItems.map((item) => (
                        <div key={item.id} className="rounded-xl border border-sky-300/60 bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-sky-950 [overflow-wrap:anywhere]">{getUnmergedItemText(item)}</p>
                              <p className="mt-1 text-xs text-sky-800/80">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                              <p className="mt-2 text-xs leading-6 text-sky-900/90 [overflow-wrap:anywhere]">{getUnmergedReasonText(item.reason)}</p>
                              <p className="mt-1 text-xs text-sky-800/70 [overflow-wrap:anywhere]">{item.op}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-sky-300/70 bg-white text-sky-900" onClick={() => void copyText(buildUnmergedCopyText(item), () => props.showNotice("已复制历史未合入内容"))}>
                                复制
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-sky-300/70 bg-white text-sky-900" onClick={() => void props.onIgnoreUnmergedItem(item.id)}>
                                忽略
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-sky-900/75">当前没有历史未合入内容。</p>
                    )}
                  </CardContent>
                </Card>

                <Card className="border-amber-400/30 bg-amber-50/90 text-amber-950 shadow-sm">
                  <CardHeader className="p-4">
                    <CardTitle>同步异常</CardTitle>
                    <CardDescription className="text-amber-900/70">这些离线改动未被云端接受，已从主同步队列隔离，不会继续阻塞后续同步。</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-3 px-4 pb-4 pt-0">
                    {props.deadLetterMutations.length ? (
                      props.deadLetterMutations.map((item) => (
                        <div key={item.id} className="rounded-xl border border-amber-300/60 bg-white px-4 py-3">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-amber-950">{item.op}</p>
                              <p className="mt-1 text-xs text-amber-800/80">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                              <p className="mt-2 text-xs leading-6 text-amber-900/90 [overflow-wrap:anywhere]">{item.deadLetterReason ?? item.lastError ?? "未返回详细原因"}</p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="ghost"
                                className="rounded-full border border-amber-300/70 bg-white text-amber-900"
                                onClick={() =>
                                  void copyText(
                                    JSON.stringify(
                                      {
                                        op: item.op,
                                        clientMutationId: item.clientMutationId,
                                        reason: item.deadLetterReason ?? item.lastError ?? null,
                                        createdAt: item.createdAt,
                                        body: item.body
                                      },
                                      null,
                                      2
                                    ),
                                    () => props.showNotice("已复制诊断信息")
                                  )
                                }
                              >
                                复制诊断
                              </Button>
                              <Button type="button" size="sm" variant="ghost" className="rounded-full border border-amber-300/70 bg-white text-amber-900" onClick={() => void props.onDismissDeadLetter(item.id)}>
                                删除
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-amber-900/75">当前没有需要人工处理的同步异常。</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : null}
          </SectionBlock>
        </div>
      </div>
    </div>
  );
}

export const SettingsLayer = memo(SettingsLayerComponent);

function downloadTextFile(text: string, filename: string, mimeType: string) {
  const url = URL.createObjectURL(new Blob([text], { type: `${mimeType};charset=utf-8` }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
