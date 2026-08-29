/**
 * knot 焦点上下文
 * 焦点 = 当前激活的结（选中即焦点，规格 v1 二.4）
 * 监听 FlowGram 选中事件 → focusedId；distanceOf 计算到焦点结的语义距离
 */
import { createContext, useContext, useCallback, useEffect, useState, ReactNode } from 'react';
import { useService, WorkflowSelectService, WorkflowDocument } from '@flowgram.ai/free-layout-editor';
interface FocusContextType {
  /** 当前焦点结 ID（无焦点为 null） */
  focusedId: string | null;
  /** 某结到焦点结的画布距离；无焦点返回 null */
  distanceOf: (id: string) => number | null;
  /** 清除焦点 */
  resetFocus: () => void;
}

const FocusContext = createContext<FocusContextType>({
  focusedId: null,
  distanceOf: () => null,
  resetFocus: () => undefined,
});

export const FocusProvider = (props: { children: ReactNode }) => {
  const selectService = useService(WorkflowSelectService);
  const document = useService(WorkflowDocument);
  const [focusedId, setFocusedId] = useState<string | null>(null);

  useEffect(() => {
    // 选中即焦点：监听 FlowGram 选中变化，取 activatedNode（当前激活节点）
    const onChange = () => {
      const node = selectService.activatedNode;
      setFocusedId(node?.id ?? null);
    };
    selectService.onSelectionChanged(onChange);
    // Provider 与画布同生命周期，不做 off（Event 接口见 @flowgram.ai/core）
  }, [selectService]);

  const distanceOf = useCallback(
    (id: string): number | null => {
      if (!focusedId || focusedId === id) return focusedId === id ? 0 : null;
      const a = document.getNode(focusedId);
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
    [focusedId, document]
  );

  const resetFocus = useCallback(() => setFocusedId(null), []);

  return (
    <FocusContext.Provider value={{ focusedId, distanceOf, resetFocus }}>
      {props.children}
    </FocusContext.Provider>
  );
};

export const useFocus = (): FocusContextType => useContext(FocusContext);
