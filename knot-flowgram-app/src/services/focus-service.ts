/**
 * FocusService —— knot 焦点状态（③ 统一状态层：focus-context Context + focusBridge 模块级单例 → FlowGram Service）
 *
 * 焦点 = 当前激活的结（选中即焦点，规格 v1 二.4）。
 * 阶段 3 P1（红队坑2 位置惯性 + 八节定案）：
 *  - 焦点出现/替换时发出重排信号（onRelayout + focusEpoch）
 *  - resetFocus 语义：只清状态不重排（布局冻结，零位移）
 *  - 清除焦点后星标/距离视觉按 visualFocusId 冻结保留，直到下一个焦点出现
 *
 * focusBridge 模块级单例同步收编为本 Service 的方法（onRelayout / focusedId getter），
 * focus-layout 插件经 ctx.get(FocusService) 订阅，模块级单例清零。
 * 行为零变化：只换状态载体。
 */
import { injectable, inject } from '@flowgram.ai/free-layout-editor';
import { WorkflowSelectService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';
import { Emitter, Event } from '@flowgram.ai/utils';

export interface FocusState {
  /** 当前焦点结 ID（无焦点为 null） */
  focusedId: string | null;
  /** 视觉焦点（冻结保留）：清除焦点后仍指向最后一个焦点，供星标/距离三级显示 */
  visualFocusId: string | null;
  /** 重排信号计数：焦点出现/替换时递增；清除焦点不变（冻结） */
  focusEpoch: number;
}

@injectable()
export class FocusService {
  @inject(WorkflowSelectService) private selectService: WorkflowSelectService;

  @inject(WorkflowDocument) private document: WorkflowDocument;

  private state: FocusState = { focusedId: null, visualFocusId: null, focusEpoch: 0 };

  private listeners: Array<() => void> = [];

  private relayoutEmitter = new Emitter<string>();

  /** 重排信号：焦点出现/替换时 fire（携带新焦点 id）；清除焦点不 fire（位置惯性） */
  readonly onRelayout: Event<string> = this.relayoutEmitter.event;

  /** onBind 后即挂：监听 FlowGram 选中变化（原 FocusProvider useEffect 逻辑平移） */
  init(): void {
    this.selectService.onSelectionChanged(() => this.syncFromSelection());
  }

  private syncFromSelection(): void {
    const id = this.selectService.activatedNode?.id ?? null;
    if (id) {
      // 焦点出现/替换 → 发重排信号（同 id 不重复触发）
      if (this.state.focusedId !== id) {
        this.state = {
          focusedId: id,
          visualFocusId: id,
          focusEpoch: this.state.focusEpoch + 1,
        };
        this.relayoutEmitter.fire(id);
        this.listeners.forEach((fn) => fn());
      }
      return;
    }
    // 清除焦点：只清状态，不发重排信号（位置惯性，布局冻结）
    if (this.state.focusedId !== null) {
      this.state = { ...this.state, focusedId: null };
      this.listeners.forEach((fn) => fn());
    }
  }

  /** 当前焦点 id（原 focusBridge.focusedId：直读 selectService.activatedNode） */
  get focusedId(): string | null {
    return this.selectService.activatedNode?.id ?? null;
  }

  getState(): FocusState {
    return this.state;
  }

  /** 某结到焦点结的画布距离；无焦点返回 null（按冻结焦点 visualFocusId 算） */
  distanceOf(id: string): number | null {
    const anchor = this.state.visualFocusId;
    if (!anchor || anchor === id) return anchor === id ? 0 : null;
    const a = this.document.getNode(anchor);
    const b = this.document.getNode(id);
    if (!a || !b) return null;
    const pa = (a.toJSON() as { meta?: { position?: { x: number; y: number } } }).meta
      ?.position ?? { x: 0, y: 0 };
    const pb = (b.toJSON() as { meta?: { position?: { x: number; y: number } } }).meta
      ?.position ?? { x: 0, y: 0 };
    return Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
  }

  /** 清除焦点（只清状态，不触发重排——位置惯性，红队坑2） */
  resetFocus(): void {
    if (this.state.focusedId !== null) {
      this.state = { ...this.state, focusedId: null };
      this.listeners.forEach((fn) => fn());
    }
  }

  subscribe(fn: () => void): () => void {
    this.listeners.push(fn);
    return () => {
      const idx = this.listeners.indexOf(fn);
      if (idx >= 0) this.listeners.splice(idx, 1);
    };
  }
}
