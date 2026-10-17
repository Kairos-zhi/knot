/**
 * Browser-side Canvas Bridge: protocol pending queue -> KnotOperationService -> ack.
 */
import { inject, injectable } from '@flowgram.ai/free-layout-editor';

import { KnotOperationService, OpErr, OpResult } from './knot-operation-service';
import { ToolType } from './tool-service';

export interface KnotCanvasBridgeConfig {
  endpoint?: string;
  token?: string | (() => string | undefined);
  enabled?: boolean;
  intervalMs?: number;
  minIntervalMs?: number;
  maxIntervalMs?: number;
  fetchImpl?: typeof fetch;
}

export type CanvasCommand =
  | { type: 'rope.connect'; fromId?: string; toId?: string; from?: string; to?: string; sourceNodeID?: string; targetNodeID?: string; fixed?: boolean }
  | { type: 'rope.disconnect'; fromId?: string; toId?: string; from?: string; to?: string; sourceNodeID?: string; targetNodeID?: string }
  | { type: 'rope.disconnectAll'; id?: string; nodeId?: string; knotId?: string }
  | { type: 'chain.thread'; ids?: string[] }
  | { type: 'chain.get'; id?: string; fromId?: string; startId?: string }
  | { type: 'generate.grow'; id?: string; knotId?: string }
  | { type: 'generate.fromSelection'; ids?: string[] }
  | { type: 'tool.set'; tool?: ToolType }
  | { type: 'tool.get' }
  | { type: 'focus.set'; id?: string | null }
  | { type: 'expand.set'; id?: string; knotId?: string }
  | { type: 'pin.toggle'; id?: string; knotId?: string; pinned?: boolean }
  | { type?: string; [key: string]: unknown };

export interface PendingCanvasCommand {
  cmdSeq: number;
  cmd: CanvasCommand;
  source?: string;
  ts?: string;
}

type AckEnvelope =
  | { cmdSeq: number; ok: true; value: unknown }
  | { cmdSeq: number; ok: false; error: { code: string; message: string } };

export interface KnotCanvasBridgeStatus {
  running: boolean;
  lastError: string | null;
  executedCount: number;
  ackedCount: number;
  failedCount: number;
  pendingAckCount: number;
}

type HostBridgeConfig = Omit<KnotCanvasBridgeConfig, 'fetchImpl'> & {
  getToken?: () => string | undefined;
};

const DEFAULT_ENDPOINT = 'http://localhost:3101';
const DEFAULT_INTERVAL_MS = 1000;
const MAX_INTERVAL_MS = 15000;
const SOURCE = 'canvas-bridge';
const PENDING_ACKS_STORAGE_KEY = 'knot.canvasBridge.pendingAcks';
const POLL_LOCK_NAME = 'knot.canvasBridge.poll';

/**
 * 进程级 in-flight 互斥：跨同一进程内多个 Canvas Bridge 实例（多 Tab / headless 测试 /
 * 无 navigator.locks 回退场景）防止对同一 cmdSeq 重复执行。纯内部实现，不涉及对外协议字段。
 */
const PROCESS_IN_FLIGHT = new Set<number>();

const errorResult = (code: string, message: string): OpErr => ({
  ok: false,
  error: { code, message },
});

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object';

const asString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const asNullableString = (value: unknown): string | null | undefined =>
  value === null ? null : asString(value);

const asBool = (value: unknown): boolean | undefined =>
  typeof value === 'boolean' ? value : undefined;

const asStringArray = (value: unknown): string[] | undefined =>
  Array.isArray(value) && value.every((item) => typeof item === 'string') ? value : undefined;

const isToolType = (value: unknown): value is ToolType =>
  value === 'hand' || value === 'stick' || value === 'rope' || value === 'scissors';

function readLocalStorage(key: string): string | undefined {
  try {
    return globalThis.localStorage?.getItem(key) || undefined;
  } catch {
    return undefined;
  }
}

function loadPendingAcks(): AckEnvelope[] {
  const raw = readLocalStorage(PENDING_ACKS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter(isAckEnvelope) : [];
  } catch {
    return [];
  }
}

function writePendingAcks(acks: Iterable<AckEnvelope>): void {
  try {
    globalThis.localStorage?.setItem(PENDING_ACKS_STORAGE_KEY, JSON.stringify([...acks]));
  } catch {
    // Storage can be unavailable in private or embedded browser contexts.
  }
}

function isAckEnvelope(value: unknown): value is AckEnvelope {
  if (!isRecord(value) || !Number.isSafeInteger(value.cmdSeq) || typeof value.ok !== 'boolean') {
    return false;
  }
  return value.ok
    ? 'value' in value
    : isRecord(value.error) && typeof value.error.code === 'string' && typeof value.error.message === 'string';
}

function readHostConfig(): HostBridgeConfig | undefined {
  const maybeWindow = globalThis as typeof globalThis & {
    __KNOT_CANVAS_BRIDGE__?: HostBridgeConfig;
  };
  return maybeWindow.__KNOT_CANVAS_BRIDGE__;
}

function normalizeEndpoint(endpoint: string | undefined): string {
  return (endpoint || DEFAULT_ENDPOINT).replace(/\/+$/, '');
}

function normalizeError(error: unknown): { code: string; message: string } {
  if (isRecord(error)) {
    return {
      code: asString(error.code) ?? 'COMMAND_FAILED',
      message: asString(error.message) ?? JSON.stringify(error),
    };
  }
  return { code: 'COMMAND_FAILED', message: String(error) };
}

@injectable()
export class KnotCanvasBridgeService {
  @inject(KnotOperationService) private operationService: KnotOperationService;

  private config: Required<Pick<KnotCanvasBridgeConfig, 'endpoint' | 'intervalMs' | 'minIntervalMs' | 'maxIntervalMs'>> &
    Pick<KnotCanvasBridgeConfig, 'token' | 'fetchImpl'> = {
      endpoint: DEFAULT_ENDPOINT,
      intervalMs: DEFAULT_INTERVAL_MS,
      minIntervalMs: DEFAULT_INTERVAL_MS,
      maxIntervalMs: MAX_INTERVAL_MS,
    };

  private running = false;

  private timer: ReturnType<typeof setTimeout> | null = null;

  private ticking = false;

  private currentIntervalMs = DEFAULT_INTERVAL_MS;

  private pendingAcks = new Map<number, AckEnvelope>();

  private status: KnotCanvasBridgeStatus = {
    running: false,
    lastError: null,
    executedCount: 0,
    ackedCount: 0,
    failedCount: 0,
    pendingAckCount: 0,
  };

  startFromHostConfig(overrides?: KnotCanvasBridgeConfig): boolean {
    const host = readHostConfig();
    const tokenFromHost = host?.token ?? host?.getToken ?? readLocalStorage('knot.canvasBridge.token');
    const endpointFromHost = host?.endpoint ?? readLocalStorage('knot.canvasBridge.endpoint');
    const enabledFromHost = host?.enabled ?? readLocalStorage('knot.canvasBridge.enabled') === 'true';
    return this.start({
      ...host,
      endpoint: endpointFromHost,
      token: tokenFromHost,
      enabled: enabledFromHost,
      ...overrides,
    });
  }

  start(config: KnotCanvasBridgeConfig): boolean {
    if (this.running) return true;
    const token = this.resolveToken(config.token);
    if (config.enabled !== true || !token) {
      this.recordError(config.enabled === true ? 'Canvas Bridge token is not configured' : null);
      return false;
    }
    const intervalMs = Math.max(100, config.intervalMs ?? config.minIntervalMs ?? DEFAULT_INTERVAL_MS);
    this.config = {
      endpoint: normalizeEndpoint(config.endpoint),
      token: config.token,
      intervalMs,
      minIntervalMs: Math.max(100, config.minIntervalMs ?? intervalMs),
      maxIntervalMs: Math.max(intervalMs, config.maxIntervalMs ?? MAX_INTERVAL_MS),
      fetchImpl: config.fetchImpl,
    };
    this.currentIntervalMs = this.config.intervalMs;
    this.restorePendingAcks();
    this.running = true;
    this.status.running = true;
    this.schedule(0);
    return true;
  }

  stop(): void {
    this.running = false;
    this.status.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  getStatus(): KnotCanvasBridgeStatus {
    return { ...this.status, pendingAckCount: this.pendingAcks.size };
  }

  async tickOnce(): Promise<void> {
    if (this.ticking) return;
    this.ticking = true;
    try {
      const worked = await this.withPollLock(async () => {
        await this.flushPendingAcks();
        if (this.pendingAcks.size === 0) {
          await this.pollAndExecute();
        }
      });
      if (worked) {
        this.currentIntervalMs = this.config.intervalMs;
        this.recordError(null);
      }
    } catch (error) {
      this.recordError(error instanceof Error ? error.message : String(error));
      this.currentIntervalMs = Math.min(this.config.maxIntervalMs, this.currentIntervalMs * 2);
    } finally {
      this.ticking = false;
      if (this.running) this.schedule(this.currentIntervalMs);
    }
  }

  private schedule(delay: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      void this.tickOnce();
    }, delay);
  }

  private resolveToken(tokenConfig?: string | (() => string | undefined)): string | undefined {
    return typeof tokenConfig === 'function' ? tokenConfig() : tokenConfig;
  }

  private getFetch(): typeof fetch {
    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    if (!fetchImpl) throw new Error('fetch is not available for Canvas Bridge');
    return fetchImpl.bind(globalThis) as typeof fetch;
  }

  private getHeaders(): HeadersInit {
    const token = this.resolveToken(this.config.token);
    if (!token) throw new Error('Canvas Bridge token is not configured');
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }

  private async postJson<T>(path: string, body: unknown): Promise<T> {
    const response = await this.getFetch()(`${this.config.endpoint}${path}`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify(body),
    });
    const text = await response.text();
    const json = text ? JSON.parse(text) : {};
    if (!response.ok) {
      const errPayload = isRecord(json) ? normalizeError(json.error) : { code: 'HTTP_ERROR', message: text };
      throw new Error(`${response.status} ${errPayload.code}: ${errPayload.message}`);
    }
    return json as T;
  }

  private async flushPendingAcks(): Promise<void> {
    for (const [cmdSeq, ack] of [...this.pendingAcks]) {
      try {
        await this.postJson('/command/ack', ack);
        this.pendingAcks.delete(cmdSeq);
        this.persistPendingAcks();
        this.status.ackedCount += 1;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('404 ')) {
          this.pendingAcks.delete(cmdSeq);
          this.persistPendingAcks();
          this.status.ackedCount += 1;
          continue;
        }
        throw error;
      }
    }
  }

  private async pollAndExecute(): Promise<void> {
    const result = await this.postJson<{ ok?: boolean; commands?: PendingCanvasCommand[] }>('/command/poll', {});
    if (result.ok !== true || !Array.isArray(result.commands)) {
      throw new Error('invalid /command/poll response');
    }
    for (const pending of result.commands) {
      if (this.pendingAcks.has(pending.cmdSeq)) continue;
      // 进程级防重复：另一实例正在执行该 cmdSeq（no-lock 回退/多 Tab 同进程）则幂等跳过，
      // 避免两实例重复 poll 到同一 pending 而重复执行画布命令。
      if (PROCESS_IN_FLIGHT.has(pending.cmdSeq)) continue;
      PROCESS_IN_FLIGHT.add(pending.cmdSeq);
      try {
        const ack = await this.executeToAck(pending);
        this.pendingAcks.set(pending.cmdSeq, ack);
        this.persistPendingAcks();
        this.status.executedCount += 1;
        if (!ack.ok) this.status.failedCount += 1;
      } finally {
        PROCESS_IN_FLIGHT.delete(pending.cmdSeq);
      }
    }
    await this.flushPendingAcks();
  }

  private async executeToAck(pending: PendingCanvasCommand): Promise<AckEnvelope> {
    try {
      const result = await this.executeCommand(pending.cmd);
      if (result.ok) return { cmdSeq: pending.cmdSeq, ok: true, value: result.value };
      return { cmdSeq: pending.cmdSeq, ok: false, error: result.error };
    } catch (error) {
      return { cmdSeq: pending.cmdSeq, ok: false, error: normalizeError(error) };
    }
  }

  private async executeCommand(cmd: CanvasCommand): Promise<OpResult<unknown>> {
    const type = cmd.type;
    switch (type) {
      case 'rope.connect': {
        const fromId = asString(cmd.fromId) ?? asString(cmd.from) ?? asString(cmd.sourceNodeID);
        const toId = asString(cmd.toId) ?? asString(cmd.to) ?? asString(cmd.targetNodeID);
        if (!fromId || !toId) return errorResult('INVALID_COMMAND', 'rope.connect requires fromId and toId');
        return this.operationService.connect(fromId, toId, { fixed: asBool(cmd.fixed), source: SOURCE });
      }
      case 'rope.disconnect': {
        const fromId = asString(cmd.fromId) ?? asString(cmd.from) ?? asString(cmd.sourceNodeID);
        const toId = asString(cmd.toId) ?? asString(cmd.to) ?? asString(cmd.targetNodeID);
        if (!fromId || !toId) return errorResult('INVALID_COMMAND', 'rope.disconnect requires fromId and toId');
        return this.operationService.disconnect(fromId, toId, { source: SOURCE });
      }
      case 'rope.disconnectAll': {
        const id = asString(cmd.id) ?? asString(cmd.nodeId) ?? asString(cmd.knotId);
        if (!id) return errorResult('INVALID_COMMAND', 'rope.disconnectAll requires id');
        return this.operationService.disconnectAll(id, { source: SOURCE });
      }
      case 'chain.thread': {
        const ids = asStringArray(cmd.ids);
        if (!ids) return errorResult('INVALID_COMMAND', 'chain.thread requires ids');
        return this.operationService.threadChain(ids, { source: SOURCE });
      }
      case 'chain.get': {
        const id = asString(cmd.fromId) ?? asString(cmd.startId) ?? asString(cmd.id);
        if (!id) return errorResult('INVALID_COMMAND', 'chain.get requires fromId');
        return this.operationService.getChain(id);
      }
      case 'generate.grow': {
        const id = asString(cmd.knotId) ?? asString(cmd.id);
        if (!id) return errorResult('INVALID_COMMAND', 'generate.grow requires knotId');
        return this.operationService.growKnot(id, undefined, { source: SOURCE });
      }
      case 'generate.fromSelection': {
        const ids = asStringArray(cmd.ids);
        if (!ids) return errorResult('INVALID_COMMAND', 'generate.fromSelection requires ids');
        return this.operationService.generateFromSelection(ids, { source: SOURCE });
      }
      case 'tool.set': {
        if (!isToolType(cmd.tool)) return errorResult('INVALID_COMMAND', 'tool.set requires valid tool');
        this.operationService.setTool(cmd.tool, { source: SOURCE });
        return { ok: true, value: undefined };
      }
      case 'tool.get':
        return { ok: true, value: this.operationService.getTool() };
      case 'focus.set': {
        const id = asNullableString(cmd.id);
        if (id === undefined) return errorResult('INVALID_COMMAND', 'focus.set requires id or null');
        if (id && !this.hasKnot(id)) return errorResult('NOT_FOUND', `knot not found: ${id}`);
        this.operationService.focusKnot(id, { source: SOURCE });
        return { ok: true, value: undefined };
      }
      case 'expand.set': {
        const id = asString(cmd.id) ?? asString(cmd.knotId);
        if (!id) return errorResult('INVALID_COMMAND', 'expand.set requires id');
        if (!this.hasKnot(id)) return errorResult('NOT_FOUND', `knot not found: ${id}`);
        this.operationService.expandKnot(id);
        return { ok: true, value: undefined };
      }
      case 'pin.toggle': {
        const id = asString(cmd.id) ?? asString(cmd.knotId);
        if (!id) return errorResult('INVALID_COMMAND', 'pin.toggle requires id');
        if (!this.hasKnot(id)) return errorResult('NOT_FOUND', `knot not found: ${id}`);
        this.operationService.togglePin(id, asBool(cmd.pinned));
        return { ok: true, value: undefined };
      }
      default:
        return errorResult('UNKNOWN_COMMAND', `unknown canvas command: ${type ?? '<missing>'}`);
    }
  }

  private recordError(message: string | null): void {
    this.status.lastError = message;
  }

  private hasKnot(id: string): boolean {
    return this.operationService.getSnapshot().assets.some((asset) => asset.id === id);
  }

  private restorePendingAcks(): void {
    for (const ack of loadPendingAcks()) {
      this.pendingAcks.set(ack.cmdSeq, ack);
    }
  }

  private persistPendingAcks(): void {
    writePendingAcks(this.pendingAcks.values());
  }

  private async withPollLock(work: () => Promise<void>): Promise<boolean> {
    const locks = (globalThis.navigator as Navigator & {
      locks?: {
        request(
          name: string,
          options: { ifAvailable: boolean },
          callback: (lock: unknown | null) => Promise<void>
        ): Promise<unknown>;
      };
    } | undefined)?.locks;
    if (!locks) {
      await work();
      return true;
    }

    let worked = false;
    await locks.request(POLL_LOCK_NAME, { ifAvailable: true }, async (lock) => {
      if (!lock) return;
      worked = true;
      await work();
    });
    return worked;
  }
}
