/**
 * ChainService —— 链卡状态（③ 统一状态层：chain-store 模块级单例 → FlowGram Service）
 *
 * 之定：绳子串联成链后链卡才出现——链卡=展示线性关系的卡片。
 * 串链完成（rope 插件 mouseup 建绳）→ setChain(ids) → 链卡浮现。
 * 无链时无卡；卡可关（绳还在画布上，卡只是链的展示肉身）。
 * 行为零变化：只换状态载体（模块级 let+listeners → @injectable 单例）。
 */
import { injectable } from '@flowgram.ai/free-layout-editor';

export interface ChainState {
  ids: string[];
  epoch: number;
}

@injectable()
export class ChainService {
  private chain: ChainState | null = null;

  private listeners: Array<(c: ChainState | null) => void> = [];

  getChain(): ChainState | null {
    return this.chain;
  }

  setChain(ids: string[]): void {
    this.chain = { ids, epoch: Date.now() };
    this.listeners.forEach((fn) => fn(this.chain));
  }

  closeChain(): void {
    this.chain = null;
    this.listeners.forEach((fn) => fn(null));
  }

  onChainChange(fn: (c: ChainState | null) => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}
