/**
 * Copyright (c) 2025 Bytedance Ltd. and/or its affiliates
 * SPDX-License-Identifier: MIT
 */

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

/**
 * 勾选状态上下文
 * 管理可见集 V_b（已勾选结的 ID 集合）
 */
interface SelectionContextType {
  checkedIds: string[];
  toggle: (id: string) => void;
}

const SelectionContext = createContext<SelectionContextType | undefined>(undefined);

/**
 * SelectionProvider
 * 在应用根部包装，提供勾选状态管理
 */
export const SelectionProvider = (props: { children: ReactNode }) => {
  const [checkedIds, setCheckedIds] = useState<string[]>([]);

  const toggle = useCallback((id: string) => {
    setCheckedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((cid) => cid !== id);
      }
      return [...prev, id];
    });
  }, []);

  return (
    <SelectionContext.Provider value={{ checkedIds, toggle }}>
      {props.children}
    </SelectionContext.Provider>
  );
};

/**
 * useSelection
 * 返回勾选状态（可见集 V_b）和 toggle 方法
 * 由 Maker A（节点勾选框渲染）调用来更新状态
 * 由 Maker C（生成面板）调用来读取已勾选结列表
 */
export const useSelection = (): SelectionContextType => {
  const context = useContext(SelectionContext);
  if (!context) {
    throw new Error('useSelection must be used within SelectionProvider');
  }
  return context;
};
