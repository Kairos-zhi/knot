/**
 * 链卡状态（之定：绳子串联成链后链卡才出现——链卡=展示线性关系的卡片）
 * 串链完成（rope 插件 mouseup 建绳）→ setChain(ids) → 链卡浮现
 * 无链时无卡；卡可关（绳还在画布上，卡只是链的展示肉身）
 */
export interface ChainState {
  ids: string[];
  epoch: number;
}

let chain: ChainState | null = null;
const listeners: Array<(c: ChainState | null) => void> = [];

export const getChain = (): ChainState | null => chain;

export const setChain = (ids: string[]): void => {
  chain = { ids, epoch: Date.now() };
  listeners.forEach((fn) => fn(chain));
};

export const closeChain = (): void => {
  chain = null;
  listeners.forEach((fn) => fn(null));
};

export const onChainChange = (fn: (c: ChainState | null) => void): (() => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};
