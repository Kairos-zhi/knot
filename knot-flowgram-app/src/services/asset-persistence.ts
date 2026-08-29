/**
 * 资产持久化（写回通道：结 → 资产）
 * 双向同步的「②结→资产」方向：
 *  - localStorage：即时持久化（刷新不丢，浏览器内闭环）
 *  - POST 写回服务：写回资产清单文件（资产本体进化）
 *
 * 监听 document.onContentChange（拖拽/勾选/生成/编辑都触发），
 * debounce 后序列化 → 双写。
 */
import { WorkflowDocument } from '@flowgram.ai/free-layout-editor';
import { AssetItem } from './asset-sync';

const LS_KEY = 'knot:canvas:v1';
const WRITE_URL = 'http://localhost:3101/write';

export interface AssetWithPosition extends AssetItem {
  position?: { x: number; y: number };
}

export interface CanvasSnapshot {
  assets: AssetWithPosition[];
  edges: {
    sourceNodeID: string;
    targetNodeID: string;
    sourcePortID?: string;
    targetPortID?: string;
  }[];
}

/** 画布 → 快照（结的内容 + 位置 + 绳结构） */
export function serializeCanvas(document: WorkflowDocument): CanvasSnapshot {
  const assets: AssetWithPosition[] = [];
  document.getAllNodes().forEach((n) => {
    const json = n.toJSON() as {
      type?: string;
      id: string;
      data?: { title?: string; summary?: string; src?: string; chain_id?: string };
      meta?: { position?: { x: number; y: number } };
    };
    if (json.type === 'knot') {
      assets.push({
        id: n.id,
        title: json.data?.title ?? '',
        summary: json.data?.summary ?? '',
        src: json.data?.src ?? '',
        chain_id: json.data?.chain_id ?? '',
        position: json.meta?.position,
      });
    }
  });
  const wjson = document.toJSON() as {
    edges?: { sourceNodeID: string; targetNodeID: string; sourcePortID?: string; targetPortID?: string }[];
  };
  return { assets, edges: wjson.edges ?? [] };
}

export function saveSnapshotLocal(snap: CanvasSnapshot): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
  } catch {
    // 隐私模式等场景静默失败
  }
}

export function loadSnapshotLocal(): CanvasSnapshot | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CanvasSnapshot;
    if (!Array.isArray(parsed.assets)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** 写回资产清单文件（资产本体） */
export async function pushSnapshotToAssetFile(snap: CanvasSnapshot): Promise<boolean> {
  try {
    const res = await fetch(WRITE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assets: snap.assets }),
    });
    const data = (await res.json()) as { ok?: boolean };
    return data.ok === true;
  } catch {
    return false; // 写回服务未启动时静默（localStorage 仍兜底）
  }
}

/** 监听画布变更 → debounce 双写（localStorage + 资产文件）；挂载后先做一次基线同步 */
export function watchCanvas(document: WorkflowDocument, opts?: { debounceMs?: number }): void {
  const debounceMs = opts?.debounceMs ?? 1200;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const fire = () => {
    timer = undefined;
    const snap = serializeCanvas(document);
    saveSnapshotLocal(snap);
    void pushSnapshotToAssetFile(snap);
  };

  document.onContentChange(() => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(fire, debounceMs);
  });

  // 基线：挂载后同步一次（画布状态 ↔ 资产文件对齐）
  setTimeout(fire, 1500);
}
