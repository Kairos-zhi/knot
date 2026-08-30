/**
 * 三原色卡片 · 动效表（P0）
 * 依据方案 §三 + 设计规范 §一 tokens：
 *  - 抽纸到顶：smooth(0.5)——z 序切换 + 微位移，--knot-ease-out
 *  - 置顶/连线反馈：snappy(0.3, bounce 0.05)
 *  - Reduce Motion：抽纸改淡入淡出（prefers-reduced-motion media query 在 card.css）
 *
 * 注：FlowGram 红线①——节点级禁止 transform。本组件为卡片**内部**纸层（非节点定位层），
 * 微位移 translate 只作用于纸叠内部元素，不触碰节点根节点 transform。
 */

export const KNOT_MOTION = {
  /** 抽纸到顶：smooth 0.5s */
  smooth: {
    duration: 500,
    cssDuration: '0.5s',
    ease: 'var(--knot-ease-out, cubic-bezier(0.2, 0.8, 0.3, 1))',
  },
  /** 置顶/连线反馈：snappy 0.3s，bounce 0.05（轻微过冲弹簧） */
  snappy: {
    duration: 300,
    cssDuration: '0.3s',
    bounce: 0.05,
    // bounce 0.05 近似：过冲量很小的 spring cubic-bezier
    ease: 'cubic-bezier(0.2, 1.05, 0.4, 1)',
  },
  /** 标签条 hover 反馈：快 */
  fast: {
    duration: 150,
    cssDuration: 'var(--knot-dur-fast, 150ms)',
  },
  /** Reduce Motion 分支：抽纸退化为淡入淡出 */
  reduceMotion: {
    duration: 200,
    cssDuration: '0.2s',
    ease: 'ease-in-out',
  },
} as const;

/** 抽纸微位移幅度（px）：纸被抽到最上时的横向抽出感 */
export const KNOT_PAPER_PULL_OFFSET = 10;

/** 纸叠内每张纸的层内偏移阶梯（px）：非错落仅微位移用，标签条露出由 --knot-paper-tab-expose 控制 */
export const KNOT_PAPER_STACK_OFFSET = 2;
