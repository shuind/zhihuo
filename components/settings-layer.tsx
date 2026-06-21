"use client";

import { memo, useEffect, useMemo, useState, type HTMLAttributes } from "react";

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
import { cn } from "@/lib/utils";
import {
  AI_PROVIDER_OPTIONS,
  DEFAULT_AI_PROVIDER,
  DEFAULT_DEEPSEEK_BASE_URL,
  DEFAULT_DEEPSEEK_MODEL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  clearAiApiSettings,
  getAiProviderDefaults,
  loadAiApiSettings,
  saveAiApiSettings,
  type AiProvider
} from "@/lib/ai-settings";

const TIMEZONE_OPTIONS = [
  { value: "Asia/Shanghai", label: "中国标准时间 (UTC+08:00)" },
  { value: "Asia/Tokyo", label: "日本标准时间 (UTC+09:00)" },
  { value: "America/Los_Angeles", label: "太平洋时间 (UTC-08:00/-07:00)" },
  { value: "America/New_York", label: "美东时间 (UTC-05:00/-04:00)" },
  { value: "Europe/London", label: "伦敦时间 (UTC+00:00/+01:00)" }
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
  return <p className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-6 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-6 pt-0", className)} {...props} />;
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
  autoSealRemindersDisabled: boolean;
  setAutoSealRemindersDisabled: (disabled: boolean) => void;
  sessionEmail: string | null;
  cloudSyncEnabled: boolean;
  cloudSyncReady: boolean;
  onSystemExport: (options: { includeLife: boolean; includeThinking: boolean }) => Promise<string | null>;
  pinEnabled: boolean;
  pinLockedUntil: number;
  onEnablePin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onDisablePin: (pin: string) => Promise<{ ok: boolean; error?: string }>;
  onChangePin: (currentPin: string, nextPin: string) => Promise<{ ok: boolean; error?: string }>;
  onForgotPin: () => Promise<void> | void;
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
  const [aiProvider, setAiProvider] = useState<AiProvider>(DEFAULT_AI_PROVIDER);
  const [aiApiKey, setAiApiKey] = useState("");
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_DEEPSEEK_BASE_URL);
  const [confirmOverwriteCloud, setConfirmOverwriteCloud] = useState(false);
  const [confirmBackupOverwrite, setConfirmBackupOverwrite] = useState(false);
  const [aiModel, setAiModel] = useState(DEFAULT_DEEPSEEK_MODEL);
  const [aiKeyVisible, setAiKeyVisible] = useState(false);
  const [advancedSyncOpen, setAdvancedSyncOpen] = useState(false);

  const [pinMode, setPinMode] = useState<"enable" | "change" | "disable">("enable");
  const [pinCurrent, setPinCurrent] = useState("");
  const [pinNext, setPinNext] = useState("");
  const [pinConfirm, setPinConfirm] = useState("");
  const [pinLoading, setPinLoading] = useState(false);

  const timezoneOptions = useMemo(() => {
    if (TIMEZONE_OPTIONS.some((item) => item.value === props.timezone)) return TIMEZONE_OPTIONS;
    return [{ value: props.timezone, label: `${props.timezone} (当前)` }, ...TIMEZONE_OPTIONS];
  }, [props.timezone]);

  const pinnedSet = useMemo(() => new Set(props.fixedTopSpaceIds), [props.fixedTopSpaceIds]);

  const pinLockedSeconds = Math.max(0, Math.ceil((props.pinLockedUntil - Date.now()) / 1000));
  const syncDotClass =
    props.syncStatus.syncSummary.tone === "good"
      ? "bg-emerald-500"
      : props.syncStatus.syncSummary.tone === "working"
        ? "bg-sky-500"
        : props.syncStatus.syncSummary.tone === "warning"
          ? "bg-amber-500"
          : "bg-slate-400";
  const pendingChangeText =
    props.syncStatus.pendingMutationCount > 0
      ? `${props.syncStatus.pendingMutationCount} 条改动等待同步`
      : props.syncStatus.hasLocalChanges
        ? "有改动等待同步"
        : "没有待同步改动";
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
  }, []);

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
    props.showNotice("AI API 设置已保存");
  };

  const clearAiSettings = () => {
    clearAiApiSettings();
    setAiProvider(DEFAULT_AI_PROVIDER);
    setAiApiKey("");
    setAiBaseUrl(DEFAULT_DEEPSEEK_BASE_URL);
    setAiModel(DEFAULT_DEEPSEEK_MODEL);
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

  const normalizePin = (value: string) => value.replace(/\D+/g, "").slice(0, 12);

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

  const submitPin = () => {
    if (pinLoading) return;
    setPinLoading(true);
    void (async () => {
      try {
        if (pinMode === "enable") {
          if (pinNext.length < 4 || pinNext.length > 12) {
            props.showNotice("PIN 需为 4-12 位数字");
            return;
          }
          if (pinNext !== pinConfirm) {
            props.showNotice("两次 PIN 不一致");
            return;
          }
          const result = await props.onEnablePin(pinNext);
          props.showNotice(result.ok ? "已开启本地锁屏 PIN" : result.error ?? "PIN 设置失败");
          if (result.ok) {
            setPinNext("");
            setPinConfirm("");
          }
          return;
        }

        if (pinMode === "disable") {
          const result = await props.onDisablePin(pinCurrent);
          props.showNotice(result.ok ? "已关闭本地锁屏 PIN" : result.error ?? "PIN 关闭失败");
          if (result.ok) setPinCurrent("");
          return;
        }

        if (pinNext.length < 4 || pinNext.length > 12) {
          props.showNotice("新 PIN 需为 4-12 位数字");
          return;
        }
        if (pinNext !== pinConfirm) {
          props.showNotice("两次新 PIN 不一致");
          return;
        }
        const result = await props.onChangePin(pinCurrent, pinNext);
        props.showNotice(result.ok ? "PIN 已更新" : result.error ?? "PIN 修改失败");
        if (result.ok) {
          setPinCurrent("");
          setPinNext("");
          setPinConfirm("");
        }
      } finally {
        setPinLoading(false);
      }
    })();
  };

  return (
    <div data-settings-layer="true" className="h-full overflow-y-auto px-4 pb-8 pt-4 md:px-8">
      <div className="mx-auto grid w-full max-w-4xl gap-4">
        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>时区设置</CardTitle>
            <CardDescription>用于时间层和想一想的本地显示。</CardDescription>
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
            <CardTitle>想一想偏好</CardTitle>
            <CardDescription>控制进阶思考里的辅助信息和封存提醒。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                <span className="mt-1 block text-xs leading-5 text-slate-500">默认隐藏；打开后只在节点辅助信息里显示。</span>
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
                <span className="mt-1 block text-xs leading-5 text-slate-500">安静两周后先提醒，不再自动替你封存。</span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>想一想顶部空间</CardTitle>
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
            <CardTitle>AI 策展 API</CardTitle>
            <CardDescription>用于思考星图与封存信笺凝练。支持 DeepSeek 与 OpenAI 兼容接口，API Key 只保存在本机。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 rounded-lg border border-slate-300 bg-white p-3">
              <label className="grid gap-2">
                <span className="text-sm text-slate-700">服务商</span>
                <select
                  value={aiProvider}
                  onChange={(event) => changeAiProvider(event.target.value as AiProvider)}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                >
                  {AI_PROVIDER_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-slate-700">API Key</span>
                <div className="flex gap-2">
                  <input
                    type={aiKeyVisible ? "text" : "password"}
                    value={aiApiKey}
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="sk-..."
                    onChange={(event) => setAiApiKey(event.target.value)}
                    className="h-10 min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-slate-700"
                    onClick={() => setAiKeyVisible((visible) => !visible)}
                  >
                    {aiKeyVisible ? "隐藏" : "显示"}
                  </Button>
                </div>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-slate-700">模型</span>
                <input
                  list="ai-model-suggestions"
                  value={aiModel}
                  onChange={(event) => setAiModel(event.target.value)}
                  placeholder={getAiProviderDefaults(aiProvider).model}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                />
                <datalist id="ai-model-suggestions">
                  <option value="deepseek-v4-flash">deepseek-v4-flash（默认）</option>
                  <option value="deepseek-v4-pro">deepseek-v4-pro</option>
                  <option value="deepseek-chat">deepseek-chat（兼容别名）</option>
                  <option value={DEFAULT_OPENAI_COMPATIBLE_MODEL}>{DEFAULT_OPENAI_COMPATIBLE_MODEL}</option>
                </datalist>
              </label>

              <label className="grid gap-2">
                <span className="text-sm text-slate-700">Base URL</span>
                <input
                  type="url"
                  value={aiBaseUrl}
                  onChange={(event) => setAiBaseUrl(event.target.value)}
                  placeholder={getAiProviderDefaults(aiProvider).baseUrl}
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                />
              </label>

              <p className="text-xs leading-5 text-slate-500">
                AI 会接收当前空间的根问题与思考节点。未填写 Key 时，会尝试使用服务端环境变量。
              </p>
            </div>
          </CardContent>
          <CardFooter className="gap-2">
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
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>本地锁屏 PIN</CardTitle>
            <CardDescription>离线或在线首开都需要先通过 PIN 门禁。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className={pinMode === "enable" ? "rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-white" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600"}
                onClick={() => setPinMode("enable")}
              >
                开启
              </button>
              <button
                type="button"
                disabled={!props.pinEnabled}
                className={pinMode === "change" ? "rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-45" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 disabled:opacity-45"}
                onClick={() => setPinMode("change")}
              >
                修改
              </button>
              <button
                type="button"
                disabled={!props.pinEnabled}
                className={pinMode === "disable" ? "rounded-full border border-slate-800 bg-slate-900 px-3 py-1 text-xs text-white disabled:opacity-45" : "rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600 disabled:opacity-45"}
                onClick={() => setPinMode("disable")}
              >
                关闭
              </button>
            </div>

            <div className="grid gap-2 rounded-lg border border-slate-300 bg-white p-3">
              {pinMode !== "enable" ? (
                <input
                  type="password"
                  inputMode="numeric"
                  value={pinCurrent}
                  onChange={(event) => setPinCurrent(normalizePin(event.target.value))}
                  placeholder="当前 PIN"
                  className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                />
              ) : null}

              {pinMode !== "disable" ? (
                <>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinNext}
                    onChange={(event) => setPinNext(normalizePin(event.target.value))}
                    placeholder={pinMode === "enable" ? "新 PIN（4-12 位数字）" : "新的 PIN"}
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                  />
                  <input
                    type="password"
                    inputMode="numeric"
                    value={pinConfirm}
                    onChange={(event) => setPinConfirm(normalizePin(event.target.value))}
                    placeholder="重复输入 PIN"
                    className="h-10 rounded-md border border-slate-300 bg-white px-3 text-sm text-slate-700 outline-none focus-visible:ring-1 focus-visible:ring-slate-400/50"
                  />
                </>
              ) : null}

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" size="sm" variant="ghost" className="rounded-full border border-slate-400/40 bg-white text-slate-700" onClick={submitPin} disabled={pinLoading}>
                  {pinLoading ? "处理中..." : pinMode === "enable" ? "开启 PIN" : pinMode === "change" ? "更新 PIN" : "关闭 PIN"}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-red-400/40 bg-red-100/70 text-red-800"
                  onClick={() => {
                    void props.onForgotPin();
                    props.showNotice("已清理本地离线数据，请重新登录后设置 PIN");
                  }}
                >
                  忘记 PIN（清本地）
                </Button>
              </div>

              <p className="text-xs text-slate-500">
                状态：{props.pinEnabled ? "已开启" : "未开启"}
                {pinLockedSeconds > 0 ? `，当前锁定 ${pinLockedSeconds}s` : ""}
              </p>
            </div>
          </CardContent>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>全量导出</CardTitle>
            <CardDescription>仅支持 Markdown 导出，可选时间层 / 想一想。</CardDescription>
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
          <CardFooter>
            {props.sessionEmail ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm text-slate-700">{props.sessionEmail}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                  onClick={props.onLogout}
                >
                  退出登录
                </Button>
              </div>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                onClick={props.onOpenAuth}
              >
                登录 / 注册
              </Button>
            )}
          </CardFooter>
        </Card>

        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>数据同步</CardTitle>
            <CardDescription>系统会自动保存并同步改动，通常不需要手动处理。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border border-slate-300 bg-white px-4 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`h-2.5 w-2.5 rounded-full ${syncDotClass}`} />
                  <div>
                    <p className="text-sm font-medium text-slate-900">{props.syncStatus.syncSummary.label}</p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">{props.syncStatus.modeLabel}</p>
                  </div>
                </div>
                <div className="text-right text-xs leading-5 text-slate-500">
                  <p>{pendingChangeText}</p>
                  <p>上次同步：{lastSyncText}</p>
                </div>
              </div>
            </div>
            {props.syncStatus.warning ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {props.syncStatus.warning}
              </div>
            ) : null}
            {props.backupPreview ? (
              <div className="rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                正在预览 {new Date(props.backupPreview.createdAt).toLocaleString("zh-CN")} 的本机备份。预览不会自动同步，也不会替换当前账号数据。
              </div>
            ) : null}
          </CardContent>
          <CardFooter>
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
        </Card>

        {advancedSyncOpen ? (
          <>
        <Card className="border-slate-400/25 bg-slate-100/90 text-slate-900">
          <CardHeader>
            <CardTitle>同步与修复</CardTitle>
            <CardDescription>用于查看当前同步健康度，并在发现双端不一致时执行云端优先的同步刷新。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 rounded-xl border border-slate-300 bg-white p-4 text-sm text-slate-700 md:grid-cols-2">
              <div>
                <p className="text-xs text-slate-500">当前同步模式</p>
                <p className="mt-1">{props.syncStatus.modeLabel}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">同步阶段</p>
                <p className="mt-1">{props.syncStatus.phase}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">本地 revision</p>
                <p className="mt-1">{props.syncStatus.localRevision ?? "未记录"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">云端 revision</p>
                <p className="mt-1">{props.syncStatus.cloudRevision ?? "未获取"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">待同步改动</p>
                <p className="mt-1">
                  {props.syncStatus.pendingMutationCount > 0
                    ? props.syncStatus.pendingMutationCount
                    : props.syncStatus.hasLocalChanges
                      ? "有本地改动"
                      : 0}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">同步异常</p>
                <p className="mt-1">{props.deadLetterMutations.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">历史未合入</p>
                <p className="mt-1">{props.unmergedItems.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">最后成功同步</p>
                <p className="mt-1">{props.syncStatus.lastSyncedAt ? new Date(props.syncStatus.lastSyncedAt).toLocaleString("zh-CN") : "暂无"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">上次检查云端</p>
                <p className="mt-1">
                  {props.syncStatus.lastCloudCheckedAt ? new Date(props.syncStatus.lastCloudCheckedAt).toLocaleString("zh-CN") : "暂无"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">云端时间</p>
                <p className="mt-1">{props.syncStatus.cloudServerTime ? new Date(props.syncStatus.cloudServerTime).toLocaleString("zh-CN") : "暂无"}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">未上传媒体</p>
                <p className="mt-1">{props.syncStatus.offlineMediaPendingCount}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">下次自动重试</p>
                <p className="mt-1">
                  {typeof props.syncStatus.nextRetryAt === "number" && Number.isFinite(props.syncStatus.nextRetryAt)
                    ? new Date(props.syncStatus.nextRetryAt).toLocaleString("zh-CN")
                    : "无需重试"}
                </p>
              </div>
              <div>
                <p className="text-xs text-slate-500">最近本地备份</p>
                <p className="mt-1">
                  {props.syncStatus.latestBackup ? new Date(props.syncStatus.latestBackup.createdAt).toLocaleString("zh-CN") : "暂无"}
                </p>
              </div>
            </div>
            {props.syncStatus.hasUnqueuedLocalChanges ? (
              <div className="rounded-xl border border-red-300/70 bg-red-50 px-4 py-3 text-sm text-red-900">
                本地存在未入队改动，已暂停自动云端覆盖，避免丢失本地内容。
              </div>
            ) : null}
            {props.syncStatus.warning ? (
              <div className="rounded-xl border border-amber-300/70 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                {props.syncStatus.warning}
              </div>
            ) : null}
            {props.syncStatus.lastRepairSummary ? (
              <div className="rounded-xl border border-slate-300 bg-white px-4 py-3 text-xs leading-6 text-slate-600">
                最近一次同步刷新：{new Date(props.syncStatus.lastRepairSummary.finishedAt).toLocaleString("zh-CN")}
                ，重放 {props.syncStatus.lastRepairSummary.replayedCount} 条，剩余待同步 {props.syncStatus.lastRepairSummary.pendingCount} 条，
                同步异常 {props.syncStatus.lastRepairSummary.deadLetterCount} 条。
              </div>
            ) : null}
            {props.backupPreview ? (
              <div className="rounded-xl border border-sky-300/70 bg-sky-50 px-4 py-3 text-sm text-sky-950">
                正在预览 {new Date(props.backupPreview.createdAt).toLocaleString("zh-CN")} 的本机备份。预览不会自动同步，也不会替换当前账号数据。
              </div>
            ) : null}
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={runManualPullCloud}
              disabled={props.syncRepairing || Boolean(props.backupPreview)}
            >
              拉取云端
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={runManualUploadLocal}
              disabled={props.syncRepairing || Boolean(props.backupPreview)}
            >
              上传本地
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-red-300/70 bg-red-50 text-red-800 disabled:opacity-40"
              onClick={runManualOverwriteCloud}
              disabled={props.syncRepairing || Boolean(props.backupPreview)}
            >
              {confirmOverwriteCloud ? "确认覆盖云端" : "本地覆盖云端"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700 disabled:opacity-40"
              onClick={runPreviewLatestBackup}
              disabled={props.syncRepairing || Boolean(props.backupPreview) || !props.syncStatus.latestBackup}
            >
              查看本机备份
            </Button>
            {props.backupPreview ? (
              <>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-slate-400/40 bg-white text-slate-700"
                  onClick={() => void props.onExitBackupPreview()}
                  disabled={props.syncRepairing}
                >
                  退出预览
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="rounded-full border border-red-300/70 bg-red-50 text-red-800 disabled:opacity-40"
                  onClick={runOverwriteCloudWithBackupPreview}
                  disabled={props.syncRepairing}
                >
                  {confirmBackupOverwrite ? "确认覆盖云端" : "用此备份覆盖云端"}
                </Button>
              </>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={runSyncRepair}
              disabled={props.syncRepairing || Boolean(props.backupPreview)}
            >
              {props.syncRepairing ? "同步刷新中..." : "同步刷新"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-full border border-slate-400/40 bg-white text-slate-700"
              onClick={() => void copyText(props.syncDiagnosticsReport, () => props.showNotice("已复制同步诊断"))}
            >
              复制诊断
            </Button>
          </CardFooter>
        </Card>

        <Card className="border-sky-400/30 bg-sky-50/90 text-sky-950">
          <CardHeader>
            <CardTitle>历史未合入内容</CardTitle>
            <CardDescription>这些历史操作未被云端接受，已隔离，不影响当前同步。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-sky-300/70 bg-white text-sky-900"
                        onClick={() => void copyText(buildUnmergedCopyText(item), () => props.showNotice("已复制历史未合入内容"))}
                      >
                        复制
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-sky-300/70 bg-white text-sky-900"
                        onClick={() => void props.onIgnoreUnmergedItem(item.id)}
                      >
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

        <Card className="border-amber-400/30 bg-amber-50/90 text-amber-950">
          <CardHeader>
            <CardTitle>同步异常</CardTitle>
            <CardDescription>这些离线改动未被云端接受，已从主同步队列隔离，不会继续阻塞后续同步。</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {props.deadLetterMutations.length ? (
              props.deadLetterMutations.map((item) => (
                <div key={item.id} className="rounded-xl border border-amber-300/60 bg-white px-4 py-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-amber-950">{item.op}</p>
                      <p className="mt-1 text-xs text-amber-800/80">{new Date(item.createdAt).toLocaleString("zh-CN")}</p>
                      <p className="mt-2 text-xs leading-6 text-amber-900/90 [overflow-wrap:anywhere]">
                        {item.deadLetterReason ?? item.lastError ?? "未返回详细原因"}
                      </p>
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
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="rounded-full border border-amber-300/70 bg-white text-amber-900"
                        onClick={() => void props.onDismissDeadLetter(item.id)}
                      >
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
      </div>
    </div>
  );
}

export const SettingsLayer = memo(SettingsLayerComponent);
