/**
 * ExpandService —— 卡片互斥展开（③ 统一状态层：expand-store 模块级单例 → FlowGram Service）
 *
 * 之定：卡片间互斥，突出实体感。hover 一张展开 → 其他已展开的自动收起；
 * 同一时间只有一张展开。行为零变化：只换状态载体。
 */
import { injectable } from '@flowgram.ai/free-layout-editor';

@injectable()
export class ExpandService {
  private expandedId: string | null = null;

  private listeners: Array<(id: string | null) => void> = [];

  getExpandedId(): string | null {
    return this.expandedId;
  }

  setExpandedId(id: string | null): void {
    if (this.expandedId === id) return;
    this.expandedId = id;
    this.listeners.forEach((fn) => fn(id));
  }

  onExpandedChange(fn: (id: string | null) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}
