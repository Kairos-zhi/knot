/**
 * SelectionService（knot 勾选集）—— ③ 统一状态层：selection-context React Context → FlowGram Service
 *
 * 管理可见集 V_b（已勾选结的 ID 集合）。
 * 原实现为 app 根部 SelectionProvider + useState；Service 化后状态唯一载体在容器单例，
 * 组件经 useKnotSelection()（useService + useSyncExternalStore）读取，行为零变化。
 *
 * 偏离官方+原因：官方 free-hover-plugin 等例子状态经 Emitter 订阅；此处用裸 listeners
 * 数组以保持与 store 时代完全一致的订阅语义（同步回调、返回 off 函数），行为零变化优先。
 */
import { injectable } from '@flowgram.ai/free-layout-editor';

@injectable()
export class KnotSelectionService {
  private checkedIds: string[] = [];

  private listeners: Array<() => void> = [];

  getCheckedIds(): string[] {
    return this.checkedIds;
  }

  toggle(id: string): void {
    if (this.checkedIds.includes(id)) {
      this.checkedIds = this.checkedIds.filter((cid) => cid !== id);
    } else {
      this.checkedIds = [...this.checkedIds, id];
    }
    this.listeners.forEach((fn) => fn());
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}
