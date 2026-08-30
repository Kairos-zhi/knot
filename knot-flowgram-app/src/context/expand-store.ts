/**
 * 卡片互斥展开（之定：卡片间互斥，突出实体感）
 * hover 一张展开 → 其他已展开的自动收起；同一时间只有一张展开。
 */
let expandedId: string | null = null;
const listeners: Array<(id: string | null) => void> = [];

export const getExpandedId = (): string | null => expandedId;

export const setExpandedId = (id: string | null): void => {
  if (expandedId === id) return;
  expandedId = id;
  listeners.forEach((fn) => fn(id));
};

export const onExpandedChange = (fn: (id: string | null) => void): (() => void) => {
  listeners.push(fn);
  return () => {
    const idx = listeners.indexOf(fn);
    if (idx >= 0) listeners.splice(idx, 1);
  };
};
