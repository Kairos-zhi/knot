/**
 * Canvas Bridge 裸 TS 断言：pending poll -> OperationService -> ack。
 * 跑法：npx tsx tests/knot-canvas-bridge.assert.ts
 */
import { createHeadlessContainer } from './headless';
import { WorkflowDocument } from '@flowgram.ai/free-layout-core';
import { KnotOperationService } from '../src/services/knot-operation-service';
import {
  KnotCanvasBridgeService,
  PendingCanvasCommand,
} from '../src/services/knot-canvas-bridge-service';

type AckBody =
  | { cmdSeq: number; ok: true; value: unknown }
  | { cmdSeq: number; ok: false; error: { code: string; message: string } };

let passCount = 0;
let failCount = 0;

function assert(cond: boolean, label: string, detail?: string): boolean {
  if (cond) {
    console.log(`  PASS ${label}`);
    return true;
  }
  console.log(`  FAIL ${label}${detail ? ` -- ${detail}` : ''}`);
  return false;
}

function group(name: string, ok: boolean): void {
  if (ok) {
    passCount += 1;
    console.log(`[PASS] ${name}`);
  } else {
    failCount += 1;
    console.log(`[FAIL] ${name}`);
  }
}

function freshBridge(fetchImpl: typeof fetch): { bridge: KnotCanvasBridgeService; svc: KnotOperationService; doc: any } {
  const c = createHeadlessContainer();
  c.bind(KnotOperationService).toSelf().inSingletonScope();
  c.bind(KnotCanvasBridgeService).toSelf().inSingletonScope();
  const svc = c.get(KnotOperationService) as KnotOperationService;
  const bridge = c.get(KnotCanvasBridgeService) as KnotCanvasBridgeService;
  const doc = c.get(WorkflowDocument) as any;
  bridge.start({ enabled: true, token: () => 'test-token', endpoint: 'http://bridge.test', fetchImpl });
  bridge.stop();
  return { bridge, svc, doc };
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeQueueFetch(queue: PendingCanvasCommand[], acks: AckBody[] = []): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const auth = (init?.headers as Record<string, string> | undefined)?.Authorization;
    if (auth !== 'Bearer test-token') {
      return jsonResponse({ ok: false, error: { code: 'UNAUTHORIZED', message: 'bad token' } }, { status: 401 });
    }
    if (url.endsWith('/command/poll')) {
      return jsonResponse({ ok: true, commands: [...queue] });
    }
    if (url.endsWith('/command/ack')) {
      const ack = JSON.parse(String(init?.body ?? '{}')) as AckBody;
      const index = queue.findIndex((item) => item.cmdSeq === ack.cmdSeq);
      if (index < 0) {
        return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } }, { status: 404 });
      }
      queue.splice(index, 1);
      acks.push(ack);
      return jsonResponse({ ok: true, cmdSeq: ack.cmdSeq });
    }
    return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: url } }, { status: 404 });
  }) as typeof fetch;
}

async function groupSuccess(): Promise<boolean> {
  const queue: PendingCanvasCommand[] = [];
  const acks: AckBody[] = [];
  const { bridge, svc, doc } = freshBridge(makeQueueFetch(queue, acks));
  const a = svc.createKnot({ title: 'A', summary: 'a' }, { x: 0, y: 0 });
  const b = svc.createKnot({ title: 'B', summary: 'b' }, { x: 200, y: 0 });
  if (!a.ok || !b.ok) return assert(false, 'seed knots', JSON.stringify({ a, b }));
  queue.push({ cmdSeq: 1, cmd: { type: 'rope.connect', fromId: a.value, toId: b.value, fixed: true } });
  await bridge.tickOnce();
  const json = doc.toJSON() as any;
  let okAll = assert(json.edges?.length === 1, 'poll 执行 rope.connect 建绳');
  okAll = assert(acks.length === 1 && acks[0].ok === true, '成功命令 ack ok') && okAll;
  okAll = assert(queue.length === 0, 'ack 后 pending 队列为空') && okAll;
  return okAll;
}

async function groupFailure(): Promise<boolean> {
  const queue: PendingCanvasCommand[] = [
    { cmdSeq: 2, cmd: { type: 'rope.disconnect', fromId: 'missing-a', toId: 'missing-b' } },
  ];
  const acks: AckBody[] = [];
  const { bridge } = freshBridge(makeQueueFetch(queue, acks));
  await bridge.tickOnce();
  let okAll = assert(acks.length === 1 && acks[0].ok === false, 'OperationService 失败 ack false');
  const error = acks[0].ok === false ? acks[0].error : undefined;
  okAll = assert(error?.code === 'NOT_FOUND', '失败保留 service error code', JSON.stringify(error)) && okAll;
  okAll = assert(queue.length === 0, '失败 ack 后 pending 队列为空') && okAll;
  return okAll;
}

async function groupUnknown(): Promise<boolean> {
  const queue: PendingCanvasCommand[] = [{ cmdSeq: 3, cmd: { type: 'unknown.command' } }];
  const acks: AckBody[] = [];
  const { bridge } = freshBridge(makeQueueFetch(queue, acks));
  await bridge.tickOnce();
  const error = acks[0]?.ok === false ? acks[0].error : undefined;
  let okAll = assert(error?.code === 'UNKNOWN_COMMAND', '未知命令 fail closed');
  okAll = assert(queue.length === 0, '未知命令 ack false 后出队') && okAll;
  return okAll;
}

async function groupMissingKnot(): Promise<boolean> {
  const queue: PendingCanvasCommand[] = [{ cmdSeq: 4, cmd: { type: 'focus.set', id: 'missing' } }];
  const acks: AckBody[] = [];
  const { bridge } = freshBridge(makeQueueFetch(queue, acks));
  await bridge.tickOnce();
  const error = acks[0]?.ok === false ? acks[0].error : undefined;
  let okAll = assert(error?.code === 'NOT_FOUND', '不存在的结点 fail closed');
  okAll = assert(queue.length === 0, '不存在结点 ack false 后出队') && okAll;
  return okAll;
}

async function groupAckRetry(): Promise<boolean> {
  const queue: PendingCanvasCommand[] = [];
  const acks: AckBody[] = [];
  let rejectFirstAck = true;
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/command/poll')) return jsonResponse({ ok: true, commands: [...queue] });
    if (url.endsWith('/command/ack') && rejectFirstAck) {
      rejectFirstAck = false;
      throw new Error('ack unavailable');
    }
    if (url.endsWith('/command/ack')) {
      const ack = JSON.parse(String(init?.body ?? '{}')) as AckBody;
      const index = queue.findIndex((item) => item.cmdSeq === ack.cmdSeq);
      if (index >= 0) queue.splice(index, 1);
      acks.push(ack);
      return jsonResponse({ ok: true, cmdSeq: ack.cmdSeq });
    }
    return jsonResponse({ ok: false }, { status: 404 });
  }) as typeof fetch;
  const { bridge, svc, doc } = freshBridge(fetchImpl);
  const a = svc.createKnot({ title: 'A', summary: 'a' }, { x: 0, y: 0 });
  const b = svc.createKnot({ title: 'B', summary: 'b' }, { x: 200, y: 0 });
  if (!a.ok || !b.ok) return assert(false, 'seed knots', JSON.stringify({ a, b }));
  queue.push({ cmdSeq: 5, cmd: { type: 'rope.connect', fromId: a.value, toId: b.value } });
  await bridge.tickOnce();
  await bridge.tickOnce();
  const json = doc.toJSON() as any;
  let okAll = assert(json.edges?.length === 1, 'ack 重试不重复执行命令');
  okAll = assert(acks.length === 1 && queue.length === 0, '暂存 ack 在下次 tick 送达') && okAll;
  return okAll;
}

async function groupOffline(): Promise<boolean> {
  const fetchImpl = (async () => {
    throw new Error('service unavailable');
  }) as typeof fetch;
  const { bridge } = freshBridge(fetchImpl);
  await bridge.tickOnce();
  const status = bridge.getStatus();
  let okAll = assert(status.lastError === 'service unavailable', '服务不可达记录 lastError', JSON.stringify(status));
  okAll = assert(status.pendingAckCount === 0, '不可达不伪造 ack') && okAll;
  return okAll;
}

async function groupDualInstance(): Promise<boolean> {
  // 双实例防重复：两实例同进程并行 poll 到同一 pending 命令（共享同一 fetch/同一 acks 闭包，
  // 无 navigator.locks 回退 → 进程级 in-flight 互斥生效），只有一方执行产生 ack，另一方幂等跳过。
  const queue: PendingCanvasCommand[] = [];
  const acks: AckBody[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.endsWith('/command/poll')) return jsonResponse({ ok: true, commands: [...queue] });
    if (url.endsWith('/command/ack')) {
      const ack = JSON.parse(String(init?.body ?? '{}')) as AckBody;
      const index = queue.findIndex((item) => item.cmdSeq === ack.cmdSeq);
      if (index < 0) return jsonResponse({ ok: false, error: { code: 'NOT_FOUND', message: 'missing' } }, { status: 404 });
      queue.splice(index, 1);
      acks.push(ack);
      return jsonResponse({ ok: true, cmdSeq: ack.cmdSeq });
    }
    return jsonResponse({ ok: false }, { status: 404 });
  }) as typeof fetch;

  const { bridge: b1, svc } = freshBridge(fetchImpl);
  const { bridge: b2 } = freshBridge(fetchImpl);
  const a = svc.createKnot({ title: 'A', summary: 'a' }, { x: 0, y: 0 });
  const b = svc.createKnot({ title: 'B', summary: 'b' }, { x: 200, y: 0 });
  if (!a.ok || !b.ok) return assert(false, 'seed knots', JSON.stringify({ a, b }));
  queue.push({ cmdSeq: 7, cmd: { type: 'rope.connect', fromId: a.value, toId: b.value, fixed: true } });

  // 双实例并发 tick（同进程，共享模块级 in-flight 互斥）
  await Promise.all([b1.tickOnce(), b2.tickOnce()]);

  let okAll = assert(acks.length === 1 && acks[0].ok === true, '双实例 poll 同一命令只执行/ack 一次', `acks=${acks.length}`);
  okAll = assert(queue.length === 0, '执行方 ack 后 pending 队列清空', `queue=${queue.length}`) && okAll;
  return okAll;
}

(async () => {
  group('成功链路 poll -> OperationService -> ack -> empty', await groupSuccess());
  group('失败链路 service error -> ack false -> empty', await groupFailure());
  group('未知命令 fail closed -> ack false -> empty', await groupUnknown());
  group('不存在结点 fail closed -> ack false -> empty', await groupMissingKnot());
  group('ack 重试不重复执行', await groupAckRetry());
  group('离线/不可达可见错误', await groupOffline());
  group('双实例 poll 同一命令只执行一次', await groupDualInstance());

  console.log(`\n汇总: ${passCount} PASS / ${failCount} FAIL（共 7 组）`);
  if (failCount > 0) process.exit(1);
  process.exit(0);
})();
