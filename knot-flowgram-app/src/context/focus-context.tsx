/**
 * knot 焦点上下文
 * 焦点 = 当前激活的结（选中即焦点，规格 v1 二.4）
 *
 * 阶段 3 P1（红队坑2 位置惯性 + 八节定案）：
 *  - 焦点出现/替换时发出重排信号（relayoutEmitter + focusEpoch）
 *  - resetFocus 语义调整：只清状态不重排（布局冻结，零位移）
 *  - 清除焦点后星标/距离视觉按 visualFocusId 冻结保留，直到下一个焦点出现
 */
import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { useService, WorkflowSelectService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';
import { Emitter, Event } from '@flowgram.ai/utils';

/**
 * 焦点重排信号桥（供非 React 环境的 focus-layout 插件订阅）。
 * 模块级单例：FocusProvider 挂载时注入状态句柄，插件 onReady 时订阅 onRelayout。
 */
class FocusBridge {
  private relayoutEmitter = new Emitter<string>();

  /** 重排信号：焦点出现/替换时 fire（携带新焦点 id）；清除焦点不 fire（位置惯性） */
  readonly onRelayout: Event<string> = this.relayoutEmitter.event;

  private getter: (() => string | null) | null = null;

  register(getter: () => string | null): void {
    this.getter = getter;
  }

  get focusedId(): string | null {
    return this.getter ? this.getter() : null;
  }

  fireRelayout(focusId: string): void {
    this.relayoutEmitter.fire(focusId);
  }
}

export const focusBridge = new FocusBridge();

interface FocusContextType {
  /** 当前焦点结 ID（无焦点为 null） */
  focusedId: string | null;
  /** 视觉焦点（冻结保留）：清除焦点后仍指向最后一个焦点，供星标/距离三级显示 */
  visualFocusId: string | null;
  /** 某结到焦点结的画布距离；无焦点返回 null */
  distanceOf: (id: string) => number | null;
  /** 清除焦点（只清状态，不触发重排——位置惯性） */
  resetFocus: () => void;
  /** 重排信号计数：焦点出现/替换时递增；清除焦点不变（冻结） */
  focusEpoch: number;
}

const FocusContext = createContext<FocusContextType>({
  focusedId: null,
  visualFocusId: null,
  distanceOf: () => null,
  resetFocus: () => undefined,
  focusEpoch: 0,
});

export const FocusProvider = (props: { children: ReactNode }) => {
  const selectService = useService(WorkflowSelectService);
  const document = useService(WorkflowDocument);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [visualFocusId, setVisualFocusId] = useState<string | null>(null);
  const [focusEpoch, setFocusEpoch] = useState(0);

  // 向桥注册状态读取（供 focus-layout 插件查询当前焦点）
  useEffect(() => {
    focusBridge.register(() => selectService.activatedNode?.id ?? null);
  }, [selectService]);

  useEffect(() => {
    // 选中即焦点：监听 FlowGram 选中变化，取 activatedNode（当前激活节点）
    const onChange = () => {
      const node = selectService.activatedNode;
      const id = node?.id ?? null;
      setFocusedId((prev) => {
        if (id) {
          // 焦点出现/替换 → 发重排信号（同 id 不重复触发）
          if (prev !== id) {
            setVisualFocusId(id);
            setFocusEpoch((e) => e + 1);
            focusBridge.fireRelayout(id);
          }
          return id;
        }
        // 清除焦点：只清状态，不发重排信号（位置惯性，布局冻结）
        return null;
      });
    };
    selectService.onSelectionChanged(onChange);
    // Provider 与画布同生命周期，不做 off（Event 接口见 @flowgram.ai/core）
  }, [selectService]);

  const distanceOf = useCallback(
    (id: string): number | null => {
      // 视觉距离按冻结焦点算：清除焦点后距离三级视觉保持，直到下一个焦点出现
      const anchor = visualFocusId;
      if (!anchor || anchor === id) return anchor === id ? 0 : null;
      const a = document.getNode(anchor);
      const b = document.getNode(id);
      if (!a || !b) return null;
      const pa = (a.toJSON() as { meta?: { position?: { x: number; y: number } } }).meta?.position ?? {
        x: 0,
        y: 0,
      };
      const pb = (b.toJSON() as { meta?: { position?: { x: number; y: number } } }).meta?.position ?? {
        x: 0,
        y: 0,
      };
      return Math.sqrt((pa.x - pb.x) ** 2 + (pa.y - pb.y) ** 2);
    },
    [visualFocusId, document]
  );

  // resetFocus 语义：只清状态不重排（位置惯性，红队坑2）
  const resetFocus = useCallback(() => setFocusedId(null), []);

  return (
    <FocusContext.Provider value={{ focusedId, visualFocusId, distanceOf, resetFocus, focusEpoch }}>
      {props.children}
    </FocusContext.Provider>
  );
};

export const useFocus = (): FocusContextType => useContext(FocusContext);
