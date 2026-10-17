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

import { KnotNode, KnotBlock, getBlocks, nextBlockId, WorkspaceState, WorkspaceChange, CompiledWorksiteInput } from '../knot-model';
import { CanvasSnapshot, serializeCanvas, normalizeCanvasSnapshot, getSnapshotProblem, setSnapshotProblem } from './asset-persistence';
import { assetsToWorkflowJSON } from './asset-sync';
import { KnotSelectionService } from './knot-selection-service';
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
  | (WorkspaceChange & { seq: number })
  | { type: 'snapshot.restored'; assetIds: string[]; source: string; seq: number }
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

  @inject(KnotSelectionService) private knotSelectionService: KnotSelectionService;

  private readonly emitter = new Emitter<KnotEvent>();

  private readonly pendingEvents: KnotEvent[] = [];

  private publishing = false;

  private restoring = false;

  private initialized = false;

  private unsubscribeWorkspace?: () => void;

  private documentSubscription?: { dispose(): void };

  private engineTimer?: ReturnType<typeof setTimeout>;

  private seq = 0;

  /** 引擎直改去抖（同一 tick 内 fromJSON 批量变更合并处理） */
  private engineSyncScheduled = false;

  private readonly knownNodes = new Set<string>();

  private readonly knownLines = new Map<string, { from: string; to: string; fixed: boolean }>();

  /** onBind 后即挂：引擎直改桥（非 service 路径的 document 变更 → 事件补发） */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    this.rebuildKnown();
    this.documentSubscription = this.document.onContentChange(() => this.scheduleEngineSync());
    this.unsubscribeWorkspace = this.knotSelectionService.subscribeChanges(change => this.emit(change));
  }

  dispose(): void {
    if (this.engineTimer) clearTimeout(this.engineTimer);
    this.documentSubscription?.dispose();
    this.unsubscribeWorkspace?.();
    this.pendingEvents.length = 0;
    this.emitter.dispose();
    this.initialized = false;
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
    if (this.restoring || getSnapshotProblem(this.document) || this.engineSyncScheduled) return;
    this.engineSyncScheduled = true;
    this.engineTimer = setTimeout(() => {
      this.engineSyncScheduled = false;
      this.engineDiff();
    }, 0);
  }

  /** 引擎直改 → diff → 补发 source:'engine' 事件（service 自己发起的操作幂等：已知集已含，不重复发） */
  private engineDiff(): void {
    if (this.document.disposed || this.restoring || getSnapshotProblem(this.document)) return;
    const curNodes = new Set<string>();
    this.document.getAllNodes().forEach((n) => {
      if (n.flowNodeType === 'knot') curNodes.add(n.id);
    });
    this.knotSelectionService.reconcileAssetReferences('engine');
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
    this.pendingEvents.push({ ...e, seq: this.seq } as KnotEvent);
    this.flushEvents();
  }

  /** One queue for all facts; an observer's reentrant command cannot overtake one. */
  private flushEvents(): void {
    if (this.publishing || this.restoring) return;
    this.publishing = true;
    try {
      while (this.pendingEvents.length) this.emitter.fire(this.pendingEvents.shift()!);
    } finally { this.publishing = false; }
  }

  private fail<T>(command: string, code: string, message: string, source: string): OpResult<T> {
    this.emit({ type: 'command.failed', command, error: { code, message }, source });
    return err(code, message) as OpResult<T>;
  }

  private blockedWrite(command: string, source: string): OpErr | undefined {
    const problem = this.restoring
      ? { code: 'RESTORE_IN_PROGRESS', message: 'Snapshot restoration is in progress' }
      : getSnapshotProblem(this.document);
    if (problem) return this.fail(command, problem.code, problem.message, source) as OpErr;
    return undefined;
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
    const blocked = this.blockedWrite('createKnot', source);
    if (blocked) return blocked;
    try {
      const id = (data as { id?: string }).id ?? `knot_${nanoid(8)}`;
      if (typeof id !== 'string' || !id.trim()) return this.fail('createKnot', 'INVALID_ID', 'Invalid asset identity', source);
      if (id === 'root') return this.fail('createKnot', 'RESERVED_ID', 'root belongs to the engine', source);
      if (this.document.getNode(id) || this.linesManager.getLineById(id)) {
        return this.fail('createKnot', 'DUPLICATE_ID', 'Asset identity already belongs to a node or line', source);
      }
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
    const blocked = this.blockedWrite('updateKnot', source);
    if (blocked) return blocked;
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
    const blocked = this.blockedWrite('deleteKnot', source);
    if (blocked) return blocked;
    const node = this.document.getNode(id);
    if (!node) return this.fail('deleteKnot', 'NOT_FOUND', `结不存在: ${id}`, source);
    try {
      // 顺带删该结所有边（不走 UI 层手清）
      this.disconnectAll(id, opts);
      this.document.removeNode(node);
      this.knotSelectionService.reconcileAssetReferences(source);
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
    const blocked = this.blockedWrite('connect', source);
    if (blocked) return blocked;
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
    const blocked = this.blockedWrite('disconnect', source);
    if (blocked) return blocked;
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
    const blocked = this.blockedWrite('disconnectAll', source);
    if (blocked) return blocked;
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
    const blocked = this.blockedWrite('threadChain', source);
    if (blocked) return blocked;
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
    const blocked = this.blockedWrite('growKnot', source);
    if (blocked) return blocked;
    const node = this.document.getNode(knotId);
    if (!node) return this.fail('growKnot', 'NOT_FOUND', `结不存在: ${knotId}`, source);
    this.emit({ type: 'generate.started', targetId: knotId, source });
    try {
      const json = node.toJSON() as { data?: KnotNode['data'] };
      const data = json.data ?? { title: '', summary: '', token: 0, src: '', chain_id: '' };
      const blocks = getBlocks(data);
      const result = await grow(knotId, blocks, onChunk);
      const unavailable = this.blockedWrite('growKnot', source);
      if (unavailable) return unavailable;
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
    const blocked = this.blockedWrite('generateFromSelection', source);
    if (blocked) return blocked;
    if (ids.length === 0) return this.fail('generateFromSelection', 'EMPTY', '未勾选任何结', source);
    this.emit({ type: 'generate.started', targetId: ids.join(','), source });
    try {
      const checked = ids.map((id) => {
        const n = this.document.getNode(id);
        const j = n?.toJSON() as { data?: { title?: string; summary?: string } } | undefined;
        return { id, title: j?.data?.title ?? id, summary: j?.data?.summary ?? '' };
      });
      const result = await generate({ checked });
      const unavailable = this.blockedWrite('generateFromSelection', source);
      if (unavailable) return unavailable;
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
    const problem = getSnapshotProblem(this.document);
    if (problem) throw new Error(`${problem.code}: ${problem.message}`);
    return serializeCanvas(this.document, this.knotSelectionService.getWorkspace());
  }

  /** Read an explicit worksite's next input. No writes, events or parent-content traversal. */
  compileWorksiteInput(worksiteId: string): OpResult<CompiledWorksiteInput> {
    if (this.restoring || this.knotSelectionService.isRestoreInProgress()) return err('RESTORE_IN_PROGRESS', '恢复尚未完成');
    const problem = getSnapshotProblem(this.document);
    if (problem) return err(problem.code, problem.message);
    if (typeof worksiteId !== 'string' || !worksiteId.trim()) return err('INVALID_WORKSITE', '工作现场身份无效');
    if (this.document.disposed) return err('DOCUMENT_UNAVAILABLE', '文档已关闭');
    try {
      const site = this.knotSelectionService.getWorkspace().worksites.find(item => item.id === worksiteId);
      if (!site) return err('NOT_FOUND', `现场不存在: ${worksiteId}`);
      const references = new Set([...site.checkedIds, ...site.excludedIds, ...(site.assetId ? [site.assetId] : [])]);
      for (const id of references) {
        if (this.document.getNode(id)?.flowNodeType !== 'knot') return err('MISSING_REFERENCE', `资产引用已失效: ${id}`);
      }
      const excluded = new Set(site.excludedIds);
      const selected = site.checkedIds.filter(id => !excluded.has(id));
      const assets = selected.map(id => {
        const node = this.document.getNode(id)!;
        const json = node.toJSON() as { data?: Partial<KnotNode['data']> };
        return { id, title: json.data?.title, summary: json.data?.summary,
          src: json.data?.src, chain_id: json.data?.chain_id, blocks: json.data?.blocks };
      });
      // Reuse the existing schema validator on selected data only; it never loads provenance parents.
      const checked = normalizeCanvasSnapshot({ assets, edges: [] });
      if (!checked.ok) return checked;
      return ok({ worksiteId: site.id, assetId: site.assetId, conversationId: site.conversationId,
        draft: site.draft, agentId: site.agentId,
        materials: checked.value.assets.map(asset => ({ id: asset.id, title: asset.title, summary: asset.summary,
          blocks: getBlocks({ ...asset, token: 0 }) })),
      });
    } catch (error) { return err('READ_FAILED', error instanceof Error ? error.message : String(error)); }
  }

  executeWorksiteCommand(command: unknown, opts?: { source?: string }): OpResult<WorkspaceState> {
    this.init();
    const source = opts?.source ?? 'human';
    const blocked = this.blockedWrite('executeWorksiteCommand', source);
    if (blocked) return blocked;
    const result = this.knotSelectionService.execute(command, source);
    if (!result.ok) return this.fail('executeWorksiteCommand', result.error.code, result.error.message, source);
    return result;
  }

  /** Verify actual imported content, not just the adapter's lack of an exception. */
  private assertDocumentContent(expected: CanvasSnapshot): void {
    const projected = assetsToWorkflowJSON(expected.assets, expected.edges);
    const wanted = projected.nodes.map(node => {
      const data = node.data as KnotNode['data'];
      return { id: node.id, title: data.title, summary: data.summary, src: data.src,
        chain_id: data.chain_id, blocks: data.blocks, position: node.meta?.position };
    });
    const actual = serializeCanvas(this.document);
    const ordered = (value: any): any => Array.isArray(value) ? value.map(ordered)
      : value !== null && typeof value === 'object'
        ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
    const canonical = (value: unknown): string => JSON.stringify(ordered(value));
    const byId = (assets: CanvasSnapshot['assets']) => [...assets].sort((a, b) => a.id.localeCompare(b.id));
    const edges = (items: CanvasSnapshot['edges']) => items.map(edge => ({
      sourceNodeID: edge.sourceNodeID, targetNodeID: edge.targetNodeID,
      sourcePortID: edge.sourcePortID ?? 'out', targetPortID: edge.targetPortID ?? 'in', data: edge.data ?? {},
    })).sort((a, b) => canonical(a).localeCompare(canonical(b)));
    if (canonical(byId(actual.assets)) !== canonical(byId(wanted)) || canonical(edges(actual.edges)) !== canonical(edges(expected.edges))) {
      throw new Error('Imported document does not match snapshot identities, content, positions or edges');
    }
  }

  /** Validate before mutation; buffer public facts until commit or a complete rollback. */
  restoreSnapshot(snapshot: unknown, opts?: { source?: string }): OpResult<void> {
    const source = opts?.source ?? 'restore';
    if (typeof source !== 'string' || !source.trim()) {
      return this.fail('restoreSnapshot', 'INVALID_SOURCE', '恢复来源无效', 'restore');
    }
    this.init();
    if (this.restoring) return this.fail('restoreSnapshot', 'RESTORE_IN_PROGRESS', 'Snapshot restoration is in progress', source);
    const checked = normalizeCanvasSnapshot(snapshot);
    if (!checked.ok) return this.fail('restoreSnapshot', checked.error.code, checked.error.message, source);
    const beforeDocument = this.document.toJSON();
    // An explicit valid restore may repair a quarantined document; normal reads cannot.
    const before = serializeCanvas(this.document, this.knotSelectionService.getWorkspace());
    const previousProblem = getSnapshotProblem(this.document);
    const transaction = this.knotSelectionService.beginRestoreTransaction();
    if (!transaction) return this.fail('restoreSnapshot', 'RESTORE_IN_PROGRESS', 'Workspace restoration is in progress', source);
    const eventStart = this.pendingEvents.length;
    this.restoring = true;
    setSnapshotProblem(this.document, { code: 'RESTORE_IN_PROGRESS', message: 'Snapshot restoration is in progress' });
    let committed = false;
    try {
      // fromJSON is additive: replacement needs clear first.
      this.document.clear();
      this.document.fromJSON(assetsToWorkflowJSON(checked.value.assets, checked.value.edges));
      this.assertDocumentContent(checked.value);
      const restored = transaction.restore(checked.value.workspace, source);
      if (!restored.ok) throw new Error(restored.error.message);
      this.rebuildKnown();
      setSnapshotProblem(this.document);
      committed = true;
      transaction.finish(true);
      this.emit({ type: 'snapshot.restored', assetIds: checked.value.assets.map(asset => asset.id), source });
      return ok(undefined);
    } catch (error) {
      try {
        this.document.clear();
        this.document.fromJSON(beforeDocument);
        this.assertDocumentContent(before);
        const rollback = transaction.restore(before.workspace, source);
        if (!rollback.ok) throw new Error(rollback.error.message);
        this.rebuildKnown();
      } catch (rollbackError) {
        this.pendingEvents.splice(eventStart);
        setSnapshotProblem(this.document, { code: 'RECOVERY_REQUIRED', message: `Incomplete rollback: ${String(rollbackError)}` });
        return this.fail('restoreSnapshot', 'ROLLBACK_FAILED', String(rollbackError), source);
      }
      this.pendingEvents.splice(eventStart);
      setSnapshotProblem(this.document, previousProblem);
      return this.fail('restoreSnapshot', 'RESTORE_FAILED', String(error), source);
    } finally {
      if (!committed) transaction.finish(false);
      this.restoring = false;
      this.flushEvents();
    }
  }

  // ── 订阅 ──
  subscribe(cb: (e: KnotEvent) => void): () => void {
    const d = this.emitter.event(event => {
      try { cb(event); } catch { /* observers cannot decide command results or silence later observers */ }
    });
    return () => d.dispose();
  }
}
