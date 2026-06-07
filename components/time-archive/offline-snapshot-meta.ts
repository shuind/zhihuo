import type { OfflineSnapshotMeta } from "@/components/offline-store";

export function areOfflineMetaEqual(a: OfflineSnapshotMeta, b: OfflineSnapshotMeta) {
  return (
    a.localProfileId === b.localProfileId &&
    a.ownerMode === b.ownerMode &&
    a.boundUserId === b.boundUserId &&
    a.revision === b.revision &&
    a.completeness === b.completeness &&
    a.lastAppliedLogId === b.lastAppliedLogId &&
    a.syncState.lastSyncedAt === b.syncState.lastSyncedAt &&
    a.syncState.hasLocalChanges === b.syncState.hasLocalChanges &&
    a.syncState.bindingRequired === b.syncState.bindingRequired
  );
}
