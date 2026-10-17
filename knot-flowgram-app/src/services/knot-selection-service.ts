/** 唯一现场状态载体；旧勾选 API 固定作用于 legacy 现场。 */
import { inject, injectable, WorkflowDocument } from '@flowgram.ai/free-layout-editor';

import type { WorkspaceChange, WorkspaceResult, WorkspaceState } from '../knot-model';
import { getSnapshotProblem } from './asset-persistence';
import {
  cloneWorkspace,
  createDefaultWorkspace,
  LEGACY_WORKSITE_ID,
  reduceWorkspace,
  validateWorkspace,
  validateWorksiteCommand,
} from './workspace-state';

export type { WorkspaceChange, WorkspaceResult } from '../knot-model';

export interface WorkspaceRestoreTransaction {
  restore(workspace: unknown, source?: string): WorkspaceResult;
  finish(commit: boolean): void;
}

function freezeWorkspace(workspace: WorkspaceState): WorkspaceState {
  workspace.worksites.forEach((site) => {
    Object.freeze(site.checkedIds);
    Object.freeze(site.excludedIds);
    Object.freeze(site);
  });
  workspace.presentations.forEach((view) => {
    Object.freeze(view.layout);
    Object.freeze(view);
  });
  Object.freeze(workspace.worksites);
  Object.freeze(workspace.presentations);
  return Object.freeze(workspace);
}

function freezeChange(change: WorkspaceChange): WorkspaceChange {
  const command = change.command;
  if ('layout' in command && command.layout) Object.freeze(command.layout);
  if ('removedIds' in command) Object.freeze(command.removedIds);
  Object.freeze(command);
  return Object.freeze(change);
}

const failure = (code: string, message: string): WorkspaceResult => ({ ok: false, error: { code, message } });

@injectable()
export class KnotSelectionService {
  @inject(WorkflowDocument) private document: WorkflowDocument;

  private workspace = freezeWorkspace(createDefaultWorkspace());

  private readonly listeners = new Set<() => void>();

  private readonly changeListeners = new Set<(change: WorkspaceChange) => void>();

  private readonly notifications: WorkspaceChange[] = [];

  private notifying = false;

  private restoreTransaction: { notificationStart: number; finishing: boolean } | null = null;

  /** 冻结 selector 缓存只用于 useSyncExternalStore 的稳定快照身份。 */
  private legacyCheckedIds = this.workspace.worksites[0].checkedIds;

  getWorkspace(): WorkspaceState {
    return freezeWorkspace(cloneWorkspace(this.workspace));
  }

  getCheckedIds(): string[] {
    return this.legacyCheckedIds;
  }

  /** 只读已有事务锁；不打开事务、不改变状态或通知。 */
  isRestoreInProgress(): boolean {
    return this.restoreTransaction !== null;
  }

  toggle(id: string): void {
    const site = this.workspace.worksites.find((item) => item.id === LEGACY_WORKSITE_ID)!;
    this.execute({
      type: 'worksite.supply', worksiteId: LEGACY_WORKSITE_ID, assetId: id,
      mode: site.checkedIds.includes(id) ? 'exclude' : 'connect',
    });
  }

  /** 恢复期间复用唯一状态，直到成功通知分派完毕才释放写锁。 */
  beginRestoreTransaction(): WorkspaceRestoreTransaction | null {
    // 从已有通知里开始会让 finish 返回早于恢复通知，无法满足外层同步事务边界。
    if (this.restoreTransaction || this.notifying) return null;
    const transaction = { notificationStart: this.notifications.length, finishing: false };
    this.restoreTransaction = transaction;
    return Object.freeze({
      restore: (workspace: unknown, source = 'restore'): WorkspaceResult => {
        if (this.restoreTransaction !== transaction || transaction.finishing) {
          return failure('RESTORE_TRANSACTION_CLOSED', '恢复事务已结束');
        }
        return this.restoreValidatedWorkspace(workspace, source);
      },
      finish: (commit: boolean): void => {
        if (this.restoreTransaction !== transaction || transaction.finishing) return;
        transaction.finishing = true;
        if (!commit) {
          this.notifications.splice(transaction.notificationStart);
          this.restoreTransaction = null;
          return;
        }
        this.flushNotifications();
      },
    });
  }

  execute(command: unknown, source = 'human'): WorkspaceResult {
    const blocked = this.publicMutationProblem();
    if (blocked) return blocked;
    if (typeof source !== 'string' || source.trim().length === 0) return failure('INVALID_SOURCE', '操作来源无效');
    const parsed = validateWorksiteCommand(command);
    if (!parsed.ok) return parsed;
    try {
      const result = reduceWorkspace(this.workspace, parsed.value, this.assetIds());
      if (!result.ok) return result;
      return this.commit(result.value, {
        type: parsed.value.type.startsWith('presentation.') ? 'presentation.changed' : 'worksite.changed',
        command: parsed.value, source,
      });
    } catch {
      return failure('DOCUMENT_UNAVAILABLE', '无法读取真实资产目录');
    }
  }

  restoreWorkspace(workspace: unknown, source = 'restore'): WorkspaceResult {
    const blocked = this.publicMutationProblem();
    if (blocked) return blocked;
    return this.restoreValidatedWorkspace(workspace, source);
  }

  /** 仅移除已不在 document 中的引用，保留现场、草稿、对话及呈现。 */
  reconcileAssetReferences(source = 'engine'): WorkspaceResult {
    const blocked = this.publicMutationProblem();
    if (blocked) return blocked;
    if (typeof source !== 'string' || source.trim().length === 0) return failure('INVALID_SOURCE', '同步来源无效');
    try {
      const assets = this.assetIds();
      const next = cloneWorkspace(this.workspace);
      const removed = new Set<string>();
      next.worksites.forEach((site) => {
        if (site.assetId !== null && !assets.has(site.assetId)) {
          removed.add(site.assetId);
          site.assetId = null;
        }
        site.checkedIds = site.checkedIds.filter((id) => {
          if (assets.has(id)) return true;
          removed.add(id);
          return false;
        });
        site.excludedIds = site.excludedIds.filter((id) => {
          if (assets.has(id)) return true;
          removed.add(id);
          return false;
        });
      });
      if (removed.size === 0) return { ok: true, value: this.getWorkspace() };
      const result = validateWorkspace(next, assets);
      if (!result.ok) return result;
      return this.commit(result.value, {
        type: 'worksite.changed', command: { type: 'workspace.reconcileAssets', removedIds: [...removed] }, source,
      });
    } catch {
      return failure('DOCUMENT_UNAVAILABLE', '无法读取真实资产目录');
    }
  }

  subscribe(fn: () => void): () => void {
    const subscriber = () => fn();
    this.listeners.add(subscriber);
    return () => { this.listeners.delete(subscriber); };
  }

  subscribeChanges(fn: (change: WorkspaceChange) => void): () => void {
    const subscriber = (change: WorkspaceChange) => fn(change);
    this.changeListeners.add(subscriber);
    return () => { this.changeListeners.delete(subscriber); };
  }

  private publicMutationProblem(): WorkspaceResult | undefined {
    if (this.restoreTransaction) return failure('RESTORE_IN_PROGRESS', '恢复事务正在进行');
    const problem = getSnapshotProblem(this.document);
    return problem ? failure(problem.code, problem.message) : undefined;
  }

  /** 内部恢复能力绕过 public barrier，供外层恢复与回滚使用。 */
  private restoreValidatedWorkspace(workspace: unknown, source: string): WorkspaceResult {
    if (typeof source !== 'string' || source.trim().length === 0) return failure('INVALID_SOURCE', '恢复来源无效');
    try {
      const result = validateWorkspace(workspace, this.assetIds());
      if (!result.ok) return result;
      return this.commit(result.value, { type: 'workspace.restored', command: { type: 'workspace.restore' }, source });
    } catch {
      return failure('DOCUMENT_UNAVAILABLE', '无法读取真实资产目录');
    }
  }

  private assetIds(): Set<string> {
    if (!this.document || this.document.disposed) throw new Error('document unavailable');
    return new Set(this.document.getAllNodes().filter((node) => node.flowNodeType === 'knot').map((node) => node.id));
  }

  /** 状态写入只有这一处；每次调用返回自身 transition，不被订阅重入覆盖。 */
  private commit(next: WorkspaceState, change: WorkspaceChange): WorkspaceResult {
    const committed = freezeWorkspace(cloneWorkspace(next));
    const returned = freezeWorkspace(cloneWorkspace(committed));
    const event = freezeChange(change);
    const checked = committed.worksites.find((site) => site.id === LEGACY_WORKSITE_ID)!.checkedIds;
    if (checked.length !== this.legacyCheckedIds.length || checked.some((id, index) => id !== this.legacyCheckedIds[index])) {
      this.legacyCheckedIds = checked;
    }
    this.workspace = committed;
    this.notifications.push(event);
    this.flushNotifications();
    return { ok: true, value: returned };
  }

  private flushNotifications(): void {
    if (this.notifying || (this.restoreTransaction && !this.restoreTransaction.finishing)) return;
    this.notifying = true;
    try {
      while (this.notifications.length > 0) {
        const change = this.notifications.shift()!;
        const listeners = [...this.listeners];
        const changeListeners = [...this.changeListeners];
        listeners.forEach((fn) => {
          try { fn(); } catch { /* 一个订阅者失败不能阻止其他订阅者。 */ }
        });
        changeListeners.forEach((fn) => {
          try { fn(change); } catch { /* 重入提交排到当前事件之后。 */ }
        });
      }
    } finally {
      this.notifying = false;
      if (this.restoreTransaction?.finishing) this.restoreTransaction = null;
    }
  }
}
