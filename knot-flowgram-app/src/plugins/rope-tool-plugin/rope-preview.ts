/**
 * rope-preview.ts —— SVG 预览层（虚线/绳头/徽章/诞生闪光）
 *
 * 从 rope-tool-plugin.ts 拆出，行为零变化。
 * 管理 fixed 定位的 SVG 预览层：虚线、绳头圆点+光晕、串中序号徽章、成链诞生闪光。
 */
import { FreeLayoutPluginContext } from '@flowgram.ai/free-layout-editor';

export interface Pos {
  x: number;
  y: number;
}

export interface RopePreview {
  showPreview(fromId: string, to: Pos): void;
  showDotOnly(sx: number, sy: number): void;
  hidePreview(): void;
  syncBadges(chain: string[], fromId: string): void;
  chainBorn(ids: string[]): void;
  nodeScreenCenter(nodeId: string): Pos | null;
  dispose(): void;
}

export function createRopePreview(
  ctx: FreeLayoutPluginContext,
  pipelineNode: HTMLElement
): RopePreview {
  // ===== 虚线预览 SVG（屏幕坐标：fixed 挂 body，鼠标 clientX/Y 直出，不随画布滚动缩放偏移） =====
  const previewSvg = window.document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  previewSvg.setAttribute('class', 'knot-rope-preview');
  previewSvg.style.cssText =
    'position:fixed;left:0;top:0;width:100vw;height:100vh;pointer-events:none;display:none;overflow:visible;z-index:9999;';
  const previewPath = window.document.createElementNS('http://www.w3.org/2000/svg', 'path');
  previewPath.setAttribute('fill', 'none');
  previewPath.setAttribute('stroke', '#999999');
  previewPath.setAttribute('stroke-width', '1');
  previewPath.setAttribute('stroke-dasharray', '6 4');
  previewSvg.appendChild(previewPath);
  // 绳头圆点（落脚点：绳拿出来就有，源头去向都可见）
  const previewDot = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  previewDot.setAttribute('r', '5');
  previewDot.setAttribute('fill', '#ff9500');
  previewSvg.appendChild(previewDot);
  // 绳头光晕（拖绳中呼吸脉动，「绳头在手」感）
  const previewDotHalo = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  previewDotHalo.setAttribute('r', '11');
  previewDotHalo.setAttribute('fill', 'none');
  previewDotHalo.setAttribute('stroke', 'rgba(255,149,0,0.4)');
  previewDotHalo.setAttribute('stroke-width', '1.5');
  previewDotHalo.setAttribute('class', 'knot-rope-dot-halo');
  previewSvg.appendChild(previewDotHalo);
  // 已串序号徽章容器（串中即时反馈：1,2,3… 直接标在结上）
  const badgeGroup = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  previewSvg.appendChild(badgeGroup);
  // 成链闪光容器（松手诞生反馈：链上结依次金圈扩散）
  const bornGroup = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
  previewSvg.appendChild(bornGroup);
  window.document.body.appendChild(previewSvg);

  /** 结的屏幕中心：DOM getBoundingClientRect（绝对准确，不依赖 toFixedPos 的坐标语义） */
  const nodeScreenCenter = (nodeId: string): Pos | null => {
    const el = pipelineNode.querySelector(
      `[data-node-id="${nodeId}"] .knot-node`,
    ) as HTMLElement | null;
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };

  const showPreview = (fromId: string, to: Pos) => {
    previewSvg.style.display = '';
    const fs = nodeScreenCenter(fromId) ?? to;
    const ts = to; // to 是屏幕坐标（拖绳时直接用鼠标 client 位置传入）
    previewPath.setAttribute('d', `M ${fs.x} ${fs.y} L ${ts.x} ${ts.y}`);
    previewDot.setAttribute('cx', String(ts.x));
    previewDot.setAttribute('cy', String(ts.y));
    previewDotHalo.setAttribute('cx', String(ts.x));
    previewDotHalo.setAttribute('cy', String(ts.y));
  };
  /** 绳头落脚点：绳子模式光标处始终可见（屏幕坐标直出，永远贴着光标） */
  const showDotOnly = (sx: number, sy: number) => {
    previewSvg.style.display = '';
    previewPath.setAttribute('d', '');
    previewDot.setAttribute('cx', String(sx));
    previewDot.setAttribute('cy', String(sy));
    previewDotHalo.setAttribute('cx', String(sx));
    previewDotHalo.setAttribute('cy', String(sy));
  };
  const hidePreview = () => {
    previewSvg.style.display = 'none';
    badgeGroup.replaceChildren();
  };
  /** 串中徽章：每个已串结上标序号（1,2,3…），屏幕坐标直出，串链全程可见 */
  const syncBadges = (chain: string[], fromId: string) => {
    badgeGroup.replaceChildren();
    const draw = (nodeId: string, num: number) => {
      const s = nodeScreenCenter(nodeId);
      if (!s) return;
      const g = window.document.createElementNS('http://www.w3.org/2000/svg', 'g');
      const bg = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      bg.setAttribute('cx', String(s.x));
      bg.setAttribute('cy', String(s.y - 34));
      bg.setAttribute('r', '11');
      bg.setAttribute('fill', '#ff9500');
      bg.setAttribute('stroke', '#ffffff');
      bg.setAttribute('stroke-width', '2');
      bg.setAttribute('class', 'knot-rope-badge knot-rope-badge--pop');
      const label = window.document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', String(s.x));
      label.setAttribute('y', String(s.y - 30));
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '11');
      label.setAttribute('font-weight', '700');
      label.setAttribute('fill', '#ffffff');
      label.textContent = String(num);
      g.appendChild(bg);
      g.appendChild(label);
      badgeGroup.appendChild(g);
    };
    draw(fromId, 0); // 起点：0 号徽章，绳的源头始终可见
    chain.forEach((id, i) => draw(id, i + 1));
  };
  /** 成链诞生闪光：链上结依次金圈扩散（Roottrees 金框锁定级正反馈，橙色单色系） */
  const chainBorn = (ids: string[]) => {
    ids.forEach((id, i) => {
      const s = nodeScreenCenter(id);
      if (!s) return;
      const ring = window.document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', String(s.x));
      ring.setAttribute('cy', String(s.y));
      ring.setAttribute('r', '10');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', 'rgba(255,149,0,0.85)');
      ring.setAttribute('stroke-width', '3');
      ring.setAttribute('class', 'knot-rope-born-ring');
      ring.style.animationDelay = `${i * 90}ms`;
      bornGroup.appendChild(ring);
      setTimeout(() => ring.remove(), 1100 + i * 90);
      // 结本体闪一次金框（错误沉默原则的反面：正确是响亮的）
      const el = pipelineNode.querySelector(`[data-node-id="${id}"] .knot-node`) as HTMLElement | null;
      if (el) {
        setTimeout(() => el.classList.add('knot-node--born'), i * 90);
        setTimeout(() => el.classList.remove('knot-node--born'), 900 + i * 90);
      }
    });
  };

  return {
    showPreview,
    showDotOnly,
    hidePreview,
    syncBadges,
    chainBorn,
    nodeScreenCenter,
    dispose: () => previewSvg.remove(),
  };
}
