export type SyncPhase =
  | "idle"
  | "checking"
  | "bootstrap"
  | "pull"
  | "push"
  | "conflict"
  | "repairing"
  | "manual_pull"
  | "manual_push"
  | "manual_overwrite"
  | "manual_upload_done"
  | "manual_pull_done"
  | "manual_overwrite_done"
  | "ready"
  | "error";

export type OfflineRuntimeState =
  | "signed_out"
  | "guest_ready"
  | "user_bootstrapping"
  | "user_syncing"
  | "user_sync_ready"
  | "user_offline_ready"
  | "binding_required"
  | "switching_account";

export type SyncSummary = {
  state: "local" | "synced" | "syncing" | "offline" | "attention";
  label: string;
  tone: "muted" | "good" | "working" | "warning";
};

type SyncStatusInput = {
  cloudSyncReady: boolean;
  deadLetterCount: number;
  hasTrackedLocalChanges: boolean;
  isBackupPreviewing: boolean;
  isOnline: boolean;
  lastSyncError: string | null;
  offlineRuntimeState: OfflineRuntimeState;
  pendingMutationCount: number;
  sessionEmail: string | null;
  syncPhase: SyncPhase;
};

export function describeOfflineRuntimeState(
  state: OfflineRuntimeState,
  options: { sessionEmail: string | null; isOnline: boolean }
) {
  switch (state) {
    case "signed_out":
      return "未登录";
    case "guest_ready":
      return options.sessionEmail ? "账号未绑定云端同步" : "本地离线模式";
    case "user_bootstrapping":
      return "账号数据初始化中";
    case "user_syncing":
      return "云端同步中";
    case "user_sync_ready":
      return options.isOnline ? "账号云端同步已就绪" : "账号离线工作模式";
    case "user_offline_ready":
      return "账号离线工作模式";
    case "binding_required":
      return "等待选择绑定方式";
    case "switching_account":
      return "账号切换中";
    default:
      return "同步状态未知";
  }
}

export function getSyncPhaseLabel(syncPhase: SyncPhase) {
  switch (syncPhase) {
    case "checking":
      return "检查云端";
    case "bootstrap":
      return "拉取云端";
    case "pull":
      return "拉取云端";
    case "push":
      return "推送中";
    case "conflict":
      return "检测到冲突";
    case "repairing":
      return "同步刷新中";
    case "manual_pull":
      return "正在拉取云端";
    case "manual_push":
      return "正在上传本地改动";
    case "manual_overwrite":
      return "正在用本地覆盖云端";
    case "manual_upload_done":
      return "本地已上传";
    case "manual_pull_done":
      return "已拉取云端";
    case "manual_overwrite_done":
      return "本地已覆盖云端";
    case "ready":
      return "已收敛";
    case "error":
      return "同步异常";
    default:
      return "空闲";
  }
}

export function getSyncModeLabel(input: {
  cloudSyncReady: boolean;
  deadLetterCount: number;
  hasTrackedLocalChanges: boolean;
  isBackupPreviewing: boolean;
  isOnline: boolean;
  lastSyncError: string | null;
  offlineRuntimeState: OfflineRuntimeState;
  pendingMutationCount: number;
  sessionEmail: string | null;
  syncPhase: SyncPhase;
}) {
  if (!input.sessionEmail) {
    if (input.lastSyncError === "unauthorized") return "登录已过期，需要重新登录";
    return "本机保存，登录后可自动同步";
  }
  if (input.isBackupPreviewing) return "正在预览本机备份";
  if (!input.isOnline) {
    return input.pendingMutationCount > 0 || input.hasTrackedLocalChanges ? "离线中，连上网后会自动同步" : "离线可用";
  }
  if (input.lastSyncError === "unauthorized") return "登录已过期，需要重新登录";
  if (input.lastSyncError) return "云端暂不可达，稍后重试";
  if (input.syncPhase === "checking") return "正在确认云端状态";
  if (input.syncPhase === "bootstrap" || input.syncPhase === "pull") return "正在接收云端更新";
  if (input.syncPhase === "conflict") return "正在整理两端改动";
  if (input.deadLetterCount > 0) return "有同步问题需要注意";
  if (input.pendingMutationCount > 0 || input.hasTrackedLocalChanges) {
    const count = input.pendingMutationCount > 0 ? input.pendingMutationCount : null;
    return count ? `有 ${count} 条改动还没同步` : "有改动还没同步";
  }
  if (input.cloudSyncReady || input.offlineRuntimeState === "user_sync_ready") return "云同步正常";
  return describeOfflineRuntimeState(input.offlineRuntimeState, {
    sessionEmail: input.sessionEmail,
    isOnline: input.isOnline
  });
}

export function getSyncSummary(input: SyncStatusInput): SyncSummary {
  if (input.isBackupPreviewing) {
    return { state: "attention", label: "同步需注意", tone: "warning" };
  }
  if (input.lastSyncError || input.deadLetterCount > 0 || input.syncPhase === "error") {
    return { state: "attention", label: "同步需注意", tone: "warning" };
  }
  if (!input.sessionEmail || input.offlineRuntimeState === "signed_out" || input.offlineRuntimeState === "guest_ready") {
    return { state: "local", label: "本机保存", tone: "muted" };
  }
  if (!input.isOnline || input.offlineRuntimeState === "user_offline_ready") {
    return { state: "offline", label: "离线，稍后同步", tone: "warning" };
  }
  if (
    input.syncPhase === "checking" ||
    input.syncPhase === "bootstrap" ||
    input.syncPhase === "pull" ||
    input.syncPhase === "push" ||
    input.syncPhase === "conflict" ||
    input.syncPhase === "repairing" ||
    input.syncPhase === "manual_pull" ||
    input.syncPhase === "manual_push" ||
    input.syncPhase === "manual_overwrite" ||
    input.offlineRuntimeState === "user_bootstrapping" ||
    input.offlineRuntimeState === "user_syncing" ||
    input.offlineRuntimeState === "switching_account"
  ) {
    return { state: "syncing", label: "同步中", tone: "working" };
  }
  if (input.pendingMutationCount > 0 || input.hasTrackedLocalChanges) {
    return { state: "syncing", label: "同步中", tone: "working" };
  }
  if (input.cloudSyncReady || input.offlineRuntimeState === "user_sync_ready") {
    return { state: "synced", label: "已同步", tone: "good" };
  }
  return { state: "local", label: "本机保存", tone: "muted" };
}
