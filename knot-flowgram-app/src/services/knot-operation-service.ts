/**
 * KnotOperationService —— knot 操作内核（二轮审计 §3.1 规格实现）
 *
 * 薄封装红线：service 是对 document/linesManager 的薄封装，绝不维护第二份状态。
 * 唯一写路径 = document API + formModel.setValueIn。
 * 事件总线：单一 Emitter，KnotEvent 带全局单调递增 seq + source（human / agent:<id>）。
 * 引擎直改桥：onContentChange 监听引擎原生直改（拖线建绳/删除快捷键删绳删结），
 * 以 source:'engine' 补发事件，agent 视图与画布永不漂移。
 */
import { injectable, inject, nanoid } from '@flowgram.ai/free-layout-editor';
import {
  FlowNodeFormData,
  FormModelV2,
  SelectionService,
  WorkflowDocument,
  WorkflowLinesManager,
} from '@flowgram.ai/free-layout-editor';
import { Emitter } from '@flowgram.ai/utils';

import { KnotNode, KnotBlock, getBlocks, nextBlockId } from '../knot-model';
import { CanvasSnapshot, serializeCanvas } from './asset-persistence';
import { generate, grow } from './generate';
import { ToolType, ToolService } from './tool-service';
import { ExpandService } from './expand-service';
import { KNOT_INPUT_PORT, KNOT_OUTPUT_PORT } from '../components/knot-edge/ports';

// ── OpResult 信封 ──
export type OpOk<T = void> = { ok: true; value: T };
export type OpErr = { ok: false; error: { code: string; message: string } };
export type OpResult<T = void> = OpOk<T> | OpErr;

const ok = <T>(value: T): OpOk<T> => ({ ok: true, value });
const err = (code: string, message: string): OpErr => ({ ok: false, error: { code, message } });

// ── 事件（事实，不含坐标/DOM）──
export type KnotEvent =
  | { type: 'knot.created'; id: string; source: string; seq: number }
  | { type: 'knot.updated'; id: string; patch: Partial<KnotNode['data']>; source: string; seq: number }
  | { type: 'knot.deleted'; id: string; source: string; seq: number }
  | { type: 'rope.connected'; fromId: string; toId: string; fixed: boolean; source: string; seq: number }
  | { type: 'rope.disconnected'; fromId: string; toId: string; source: string; seq: number }
  | { type: 'chain.threaded'; ids: string[]; source: string; seq: number }
  | { type: 'generate.started'; targetId: string; source: string; seq: number }
  | { type: 'generate.completed'; targetId: string; newBlockId?: string; source: string; seq: number }
  | { type: 'tool.changed'; tool: ToolType; source: string; seq: number }
  | { type: 'focus.changed'; id: string | null; source: string; seq: number }
  | { type: 'command.failed'; command: string; error: { code: string; message: string }; source: string; seq: number };

type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K> : never;

@injectable()
export class KnotOperationService {
  @inject(WorkflowDocument) private document: WorkflowDocument;

  @inject(WorkflowLinesManager) private linesManager: WorkflowLinesManager;

  @inject(SelectionService) private selectionService: SelectionService;

  @inject(ToolService) private toolService: ToolService;

  @inject(ExpandService) private expandService: ExpandService;

  private readonly emitter = new Emitter<KnotEvent>();

  private seq = 0;

  /** 引擎直改去抖（同一 tick 内 fromJSON 批量变更合并处理） */
  private engineSyncScheduled = false;

  private readonly knownNodes = new Set<string>();

  private readonly knownLines = new Map<string, { from: string; to: string; fixed: boolean }>();

  /** onBind 后即挂：引擎直改桥（非 service 路径的 document 变更 → 事件补发） */
  init(): void {
    this.rebuildKnown();
    this.document.onContentChange(() => this.scheduleEngineSync());
  }

  private rebuildKnown(): void {
    this.knownNodes.clear();
    this.knownLines.clear();
    this.document.getAllNodes().forEach((n) => {
      if (n.flowNodeType === 'knot') this.knownNodes.add(n.id);
    });
    this.linesManager.getAllAvailableLines().forEach((l) => {
      if (l.from && l.to) {
        this.knownLines.set(l.id, {
          from: l.from.id,
          to: l.to.id,
          fixed: !!(l.lineData as { fixed?: boolean } | undefined)?.fixed,
        });
      }
    });
  }

  private scheduleEngineSync(): void {
    if (this.engineSyncScheduled) return;
    this.engineSyncScheduled = true;
    setTimeout(() => {
      this.engineSyncScheduled = false;
      this.engineDiff();
    }, 0);
  }

  /** 引擎直改 → diff → 补发 source:'engine' 事件（service 自己发起的操作幂等：已知集已含，不重复发） */
  private engineDiff(): void {
    if (this.document.disposed) return;
    const curNodes = new Set<string>();
    this.document.getAllNodes().forEach((n) => {
      if (n.flowNodeType === 'knot') curNodes.add(n.id);
    });
    curNodes.forEach((id) => {
      if (!this.knownNodes.has(id)) {
        this.knownNodes.add(id);
        this.emit({ type: 'knot.created', id, source: 'engine' });
      }
    });
    [...this.knownNodes].forEach((id) => {
      if (!curNodes.has(id)) {
        this.knownNodes.delete(id);
        this.emit({ type: 'knot.deleted', id, source: 'engine' });
      }
    });

    const curLines = new Map<string, { from: string; to: string; fixed: boolean }>();
    this.linesManager.getAllAvailableLines().forEach((l) => {
      if (l.from && l.to) {
        curLines.set(l.id, {
          from: l.from.id,
          to: l.to.id,
          fixed: !!(l.lineData as { fixed?: boolean } | undefined)?.fixed,
        });
      }
    });
    curLines.forEach((v, key) => {
      if (!this.knownLines.has(key)) {
        this.knownLines.set(key, v);
        this.emit({ type: 'rope.connected', fromId: v.from, toId: v.to, fixed: v.fixed, source: 'engine' });
      }
    });
    [...this.knownLines].forEach(([key, v]) => {
      if (!curLines.has(key)) {
        this.knownLines.delete(key);
        this.emit({ type: 'rope.disconnected', fromId: v.from, toId: v.to, source: 'engine' });
      }
    });
  }

  private emit(e: DistributiveOmit<KnotEvent, 'seq'>): void {
    this.seq += 1;
    this.emitter.fire({ ...e, seq: this.seq } as KnotEvent);
  }

  private fail<T>(command: string, code: string, message: string, source: string): OpResult<T> {
    this.emit({ type: 'command.failed', command, error: { code, message }, source });
    return err(code, message) as OpResult<T>;
  }

  /** 已知集登记（service 路径：engineDiff 幂等不重复发） */
  private trackLine(lineId: string, from: string, to: string, fixed: boolean): void {
    this.knownLines.set(lineId, { from, to, fixed });
  }

  // ── 结 ──
  createKnot(
    data: Partial<KnotNode['data']>,
    position?: { x: number; y: number },
    opts?: { source?: string }
  ): OpResult<string> {
    const source = opts?.source ?? 'human';
    try {
      const id = (data as { id?: string }).id ?? `knot_${nanoid(8)}`;
      const node = this.document.createWorkflowNodeByType(
        'knot',
        position ?? { x: 120, y: 120 },
        {
          id,
          data: {
            title: data.title ?? '',
            summary: data.summary ?? '',
            token: data.token ?? Math.max(64, Math.round((data.summary ?? '').length * 2.5)),
            src: data.src ?? '',
            chain_id: data.chain_id ?? '',
            ...(data.blocks ? { blocks: data.blocks } : {}),
          },
          meta: { defaultPorts: [KNOT_INPUT_PORT, KNOT_OUTPUT_PORT] },
        }
      );
      if (!node) return this.fail('createKnot', 'CREATE_FAILED', 'document 未返回节点', source);
      this.knownNodes.add(node.id);
      this.emit({ type: 'knot.created', id: node.id, source });
      return ok(node.id);
    } catch (e) {
      return this.fail('createKnot', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  updateKnot(
    id: string,
    patch: Partial<KnotNode['data']>,
    opts?: { source?: string }
  ): OpResult<void> {
    const source = opts?.source ?? 'human';
    const node = this.document.getNode(id);
    if (!node) return this.fail('updateKnot', 'NOT_FOUND', `结不存在: ${id}`, source);
    try {
      const formModel = node.getData(FlowNodeFormData).getFormModel<FormModelV2>();
      if (!formModel) return this.fail('updateKnot', 'NO_FORM', 'formModel 不可用', source);
      Object.entries(patch).forEach(([k, v]) => {
        formModel.setValueIn(k, v);
      });
      this.emit({ type: 'knot.updated', id, patch, source });
      return ok(undefined);
    } catch (e) {
      return this.fail('updateKnot', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  deleteKnot(id: string, opts?: { source?: string }): OpResult<boolean> {
    const source = opts?.source ?? 'human';
    const node = this.document.getNode(id);
    if (!node) return this.fail('deleteKnot', 'NOT_FOUND', `结不存在: ${id}`, source);
    try {
      // 顺带删该结所有边（不走 UI 层手清）
      this.disconnectAll(id, opts);
      this.document.removeNode(node);
      this.knownNodes.delete(id);
      this.emit({ type: 'knot.deleted', id, source });
      return ok(true);
    } catch (e) {
      return this.fail('deleteKnot', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  // ── 绳 ──
  connect(
    fromId: string,
    toId: string,
    opts?: { fixed?: boolean; source?: string }
  ): OpResult<boolean> {
    const source = opts?.source ?? 'human';
    try {
      const from = this.document.getNode(fromId);
      const to = this.document.getNode(toId);
      if (!from || !to) return this.fail('connect', 'NOT_FOUND', `结不存在: ${fromId} → ${toId}`, source);
      if (from.flowNodeType !== 'knot' || to.flowNodeType !== 'knot') {
        return this.fail('connect', 'NOT_KNOT', '只能连 knot 结', source);
      }
      // 幂等：已存在只补 fixed，不重复建
      const existing = this.linesManager.getLine({ from: fromId, to: toId });
      if (existing) {
        if (opts?.fixed) {
          existing.lineData = { ...(existing.lineData ?? {}), fixed: true };
          this.trackLine(existing.id, fromId, toId, true);
        }
        return ok(true);
      }
      const line = this.linesManager.createLine({
        from: fromId,
        to: toId,
        fromPort: 'out',
        toPort: 'in',
        ...(opts?.fixed ? { data: { fixed: true } } : {}),
      });
      if (!line) return this.fail('connect', 'LINE_REJECTED', 'linesManager 拒绝建绳', source);
      this.trackLine(line.id, fromId, toId, !!opts?.fixed);
      this.emit({ type: 'rope.connected', fromId, toId, fixed: !!opts?.fixed, source });
      return ok(true);
    } catch (e) {
      return this.fail('connect', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  disconnect(fromId: string, toId: string, opts?: { source?: string }): OpResult<boolean> {
    const source = opts?.source ?? 'human';
    try {
      const line = this.linesManager.getLine({ from: fromId, to: toId });
      if (!line) return this.fail('disconnect', 'NOT_FOUND', `绳不存在: ${fromId} → ${toId}`, source);
      if (!this.linesManager.canRemove(line)) {
        return this.fail('disconnect', 'CANNOT_REMOVE', 'linesManager.canRemove=false', source);
      }
      this.knownLines.delete(line.id);
      line.dispose();
      this.emit({ type: 'rope.disconnected', fromId, toId, source });
      return ok(true);
    } catch (e) {
      return this.fail('disconnect', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  /** 红灯断绳：两侧（from/to 都是 WorkflowNodeEntity 对象，按 .id 比对）真删，返回删除边数 */
  disconnectAll(nodeId: string, opts?: { source?: string }): OpResult<number> {
    const source = opts?.source ?? 'human';
    try {
      const lines = this.linesManager
        .getAllAvailableLines()
        .filter((l) => l.from?.id === nodeId || l.to?.id === nodeId);
      let removed = 0;
      lines.forEach((l) => {
        if (this.linesManager.canRemove(l)) {
          const fromId = l.from?.id ?? '';
          const toId = l.to?.id ?? '';
          this.knownLines.delete(l.id);
          l.dispose();
          removed += 1;
          this.emit({ type: 'rope.disconnected', fromId, toId, source });
        }
      });
      return ok(removed);
    } catch (e) {
      return this.fail('disconnectAll', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  // ── 链 ──
  /** 按序建绳 A→B→C，返回实际建成的边键列表（幂等：已有边跳过仍计入） */
  threadChain(ids: string[], opts?: { source?: string }): OpResult<string[]> {
    const source = opts?.source ?? 'human';
    if (ids.length < 2) return this.fail('threadChain', 'TOO_SHORT', '链至少需要 2 个结', source);
    const keys: string[] = [];
    for (let i = 0; i < ids.length - 1; i++) {
      const r = this.connect(ids[i], ids[i + 1], { source });
      if (!r.ok) return this.fail('threadChain', r.error.code, `第 ${i} 段失败: ${r.error.message}`, source);
      keys.push(`${ids[i]}->${ids[i + 1]}`);
    }
    this.emit({ type: 'chain.threaded', ids, source });
    return ok(keys);
  }

  /** 沿 out 边 BFS，返回路径 id 列表（含起点；环防护） */
  getChain(fromId: string): OpResult<string[]> {
    const node = this.document.getNode(fromId);
    if (!node) return this.fail('getChain', 'NOT_FOUND', `结不存在: ${fromId}`, 'human');
    const path: string[] = [fromId];
    const visited = new Set<string>([fromId]);
    let cur = fromId;
    for (;;) {
      const next = this.linesManager
        .getAllAvailableLines()
        .find((l) => l.from?.id === cur && l.to && !visited.has(l.to.id));
      if (!next || !next.to) break;
      visited.add(next.to.id);
      path.push(next.to.id);
      cur = next.to.id;
    }
    return ok(path);
  }

  // ── 生成 ──
  /** 续长：以该结为 V_b 触发生成，新块接尾（P0-3 写路径=formModel.setValueIn） */
  async growKnot(
    knotId: string,
    onChunk?: (t: string) => void,
    opts?: { source?: string }
  ): Promise<OpResult<KnotBlock>> {
    const source = opts?.source ?? 'human';
    const node = this.document.getNode(knotId);
    if (!node) return this.fail('growKnot', 'NOT_FOUND', `结不存在: ${knotId}`, source);
    this.emit({ type: 'generate.started', targetId: knotId, source });
    try {
      const json = node.toJSON() as { data?: KnotNode['data'] };
      const data = json.data ?? { title: '', summary: '', token: 0, src: '', chain_id: '' };
      const blocks = getBlocks(data);
      const result = await grow(knotId, blocks, onChunk);
      const newBlock: KnotBlock = {
        id: nextBlockId(blocks),
        source: 'generated',
        timestamp: result.timestamp,
        provenance: result.provenance,
        content: result.content,
      };
      const formModel = node.getData(FlowNodeFormData).getFormModel<FormModelV2>();
      if (!formModel) return this.fail('growKnot', 'NO_FORM', 'formModel 不可用', source);
      const next = [...blocks, newBlock];
      formModel.setValueIn('blocks', next);
      formModel.setValueIn('summary', next[0]?.content ?? data.summary);
      this.emit({ type: 'knot.updated', id: knotId, patch: { blocks: next }, source });
      this.emit({ type: 'generate.completed', targetId: knotId, newBlockId: newBlock.id, source });
      return ok(newBlock);
    } catch (e) {
      return this.fail('growKnot', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  /** 勾选生成：生成 + 建结 + 绳连回 V_b（端到端），返回新结 id */
  async generateFromSelection(
    ids: string[],
    opts?: { source?: string }
  ): Promise<OpResult<string>> {
    const source = opts?.source ?? 'human';
    if (ids.length === 0) return this.fail('generateFromSelection', 'EMPTY', '未勾选任何结', source);
    this.emit({ type: 'generate.started', targetId: ids.join(','), source });
    try {
      const checked = ids.map((id) => {
        const n = this.document.getNode(id);
        const j = n?.toJSON() as { data?: { title?: string; summary?: string } } | undefined;
        return { id, title: j?.data?.title ?? id, summary: j?.data?.summary ?? '' };
      });
      const result = await generate({ checked });
      // 位置=V_b 质心右下方
      let sumX = 0;
      let sumY = 0;
      let cnt = 0;
      ids.forEach((id) => {
        const n = this.document.getNode(id);
        const j = n?.toJSON() as { meta?: { position?: { x: number; y: number } } } | undefined;
        if (j?.meta?.position) {
          sumX += j.meta.position.x;
          sumY += j.meta.position.y;
          cnt += 1;
        }
      });
      const pos = cnt > 0 ? { x: sumX / cnt + 160, y: sumY / cnt + 120 } : { x: 400, y: 400 };
      const r = this.createKnot(
        {
          title: result.title,
          summary: result.summary,
          token: 0,
          src: `generated:${ids.join(',')}`,
          chain_id: 'chain_gen',
        },
        pos,
        { source }
      );
      if (!r.ok) return r;
      const newId = r.value;
      ids.forEach((fromId) => {
        this.connect(fromId, newId, { source });
      });
      this.emit({ type: 'generate.completed', targetId: newId, source });
      return ok(newId);
    } catch (e) {
      return this.fail('generateFromSelection', 'EXCEPTION', e instanceof Error ? e.message : String(e), source);
    }
  }

  // ── 工具 / 视图 ──
  setTool(tool: ToolType, opts?: { source?: string }): void {
    this.toolService.setTool(tool);
    this.emit({ type: 'tool.changed', tool, source: opts?.source ?? 'human' });
  }

  getTool(): ToolType {
    return this.toolService.getTool();
  }

  focusKnot(id: string | null, opts?: { source?: string }): void {
    this.selectionService.selection = id ? [this.document.getNode(id)!] : [];
    this.emit({ type: 'focus.changed', id, source: opts?.source ?? 'human' });
  }

  expandKnot(id: string): void {
    this.expandService.setExpandedId(id);
  }

  /** pin 是纯 UI 态（组件本地），入口收敛到 service 便于 agent 读 */
  togglePin(id: string, pinned?: boolean): void {
    window.dispatchEvent(new CustomEvent('knot:toggle-pin', { detail: { id, pinned } }));
  }

  // ── 感知 ──
  getSnapshot(): CanvasSnapshot {
    return serializeCanvas(this.document);
  }

  // ── 订阅 ──
  subscribe(cb: (e: KnotEvent) => void): () => void {
    const d = this.emitter.event(cb);
    return () => d.dispose();
  }
}
