/**
 * attract-manager.ts —— 吸附光晕管理
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * 管理拖绳时目标结的吸附光晕（.knot-node--attract class 切换）。
 */

export interface AttractManager {
  setAttract(nodeId: string | null): void;
  dispose(): void;
}

export function createAttractManager(pipelineNode: HTMLElement): AttractManager {
  let attractEl: HTMLElement | null = null;

  const setAttract = (nodeId: string | null) => {
    if (attractEl) {
      attractEl.classList.remove('knot-node--attract');
      attractEl = null;
    }
    if (!nodeId) return;
    const el = pipelineNode.querySelector(
      `[data-node-id="${nodeId}"] .knot-node`
    ) as HTMLElement | null;
    if (el) {
      el.classList.add('knot-node--attract');
      attractEl = el;
    }
  };

  return {
    setAttract,
    dispose: () => setAttract(null),
  };
}
