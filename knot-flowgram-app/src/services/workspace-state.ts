import type {
  PresentationLayout,
  PresentationState,
  WorksiteCommand,
  WorksiteState,
  WorkspaceResult,
  WorkspaceState,
} from '../knot-model';

export type { WorksiteCommand, WorkspaceChange, WorkspaceResult } from '../knot-model';

export const LEGACY_WORKSITE_ID = 'legacy';

type Failure = Extract<WorkspaceResult, { ok: false }>;
type CommandResult = { ok: true; value: WorksiteCommand } | Failure;
type RecordValue = Record<string, unknown>;

const fail = (code: string, message: string): Failure => ({ ok: false, error: { code, message } });
const isRecord = (value: unknown): value is RecordValue =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
const isId = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const isNullableId = (value: unknown): value is string | null => value === null || isId(value);
const hasOnlyKeys = (value: RecordValue, keys: readonly string[]): boolean =>
  Object.keys(value).every((key) => keys.includes(key));
const owns = (value: RecordValue, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const isKind = (value: unknown): value is PresentationState['kind'] =>
  value === 'window' || value === 'card' || value === 'icon';

/** 只读一次 data descriptor，拒绝 accessor、稀疏数组和循环引用。 */
function snapshotPlainData(value: unknown, ancestors = new Set<object>()): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (ancestors.has(value)) throw new Error('cyclic input');
  const prototype = Object.getPrototypeOf(value);
  if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) throw new Error('non-plain input');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string') || keys.some((key) => !('value' in descriptors[key as string]))) {
    throw new Error('accessor or symbol input');
  }
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const length = descriptors.length.value as number;
      if (!Number.isSafeInteger(length) || length < 0 || keys.length !== length + 1) throw new Error('invalid array');
      const copy: unknown[] = [];
      for (let index = 0; index < length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) throw new Error('sparse array');
        copy.push(snapshotPlainData(descriptor.value, ancestors));
      }
      return copy;
    }
    const copy: RecordValue = Object.create(null);
    for (const key of keys as string[]) copy[key] = snapshotPlainData(descriptors[key].value, ancestors);
    return copy;
  } finally {
    ancestors.delete(value);
  }
}

function isLayout(value: unknown, partial = false): value is PresentationLayout {
  if (!isRecord(value) || !hasOnlyKeys(value, ['x', 'y', 'width', 'height'])) return false;
  if (!partial && (!owns(value, 'x') || !owns(value, 'y'))) return false;
  return Object.entries(value).every(([key, dimension]) =>
    typeof dimension === 'number' && Number.isFinite(dimension)
    && ((key !== 'width' && key !== 'height') || dimension > 0));
}

function isIdList(value: unknown, assets: ReadonlySet<string>): value is string[] {
  return Array.isArray(value) && Array.from(value).every((id) => isId(id) && assets.has(id))
    && new Set(value).size === value.length;
}

function copyLayout(value: PresentationLayout): PresentationLayout {
  return {
    x: value.x,
    y: value.y,
    ...(value.width !== undefined ? { width: value.width } : {}),
    ...(value.height !== undefined ? { height: value.height } : {}),
  };
}

export function cloneWorkspace(value: WorkspaceState): WorkspaceState {
  return {
    activeWorksiteId: value.activeWorksiteId,
    worksites: value.worksites.map((site) => ({
      id: site.id, assetId: site.assetId, conversationId: site.conversationId,
      draft: site.draft, agentId: site.agentId,
      checkedIds: [...site.checkedIds], excludedIds: [...site.excludedIds],
    })),
    presentations: value.presentations.map((view) => ({
      id: view.id, worksiteId: view.worksiteId, kind: view.kind, closed: view.closed,
      layout: copyLayout(view.layout),
    })),
  };
}

export function createDefaultWorkspace(): WorkspaceState {
  return {
    activeWorksiteId: LEGACY_WORKSITE_ID,
    worksites: [{
      id: LEGACY_WORKSITE_ID, assetId: null, conversationId: null,
      draft: '', agentId: null, checkedIds: [], excludedIds: [],
    }],
    presentations: [],
  };
}

/** 校验完整快照并返回白名单副本；失败不修补或静默丢弃引用。 */
export function validateWorkspace(workspace: unknown, assetIds: Iterable<string>): WorkspaceResult {
  try {
    workspace = snapshotPlainData(workspace);
    const assets = new Set(assetIds);
    if (!isRecord(workspace) || !hasOnlyKeys(workspace, ['activeWorksiteId', 'worksites', 'presentations'])
      || !isId(workspace.activeWorksiteId) || !Array.isArray(workspace.worksites)
      || !Array.isArray(workspace.presentations) || workspace.worksites.length === 0) {
      return fail('INVALID_WORKSPACE', '工作区结构无效');
    }
    const sites = new Set<string>();
    for (const site of workspace.worksites) {
      if (!isRecord(site) || !hasOnlyKeys(site, ['id', 'assetId', 'conversationId', 'draft', 'agentId', 'checkedIds', 'excludedIds'])
        || !isId(site.id) || sites.has(site.id) || !isNullableId(site.assetId)
        || !isNullableId(site.conversationId) || typeof site.draft !== 'string' || !isNullableId(site.agentId)
        || !isIdList(site.checkedIds, assets) || !isIdList(site.excludedIds, assets)) {
        return fail('INVALID_WORKSPACE', '现场字段、唯一标识或资产引用无效');
      }
      if (site.assetId !== null && !assets.has(site.assetId)) return fail('MISSING_ASSET', `资产不存在: ${site.assetId}`);
      const excludedIds = site.excludedIds;
      if (site.checkedIds.some((id) => excludedIds.includes(id))) return fail('INVALID_WORKSPACE', '供给与人工排除不能重叠');
      sites.add(site.id);
    }
    if (!sites.has(LEGACY_WORKSITE_ID) || !sites.has(workspace.activeWorksiteId)) {
      return fail('MISSING_WORKSITE', 'legacy 现场或当前现场不存在');
    }
    const presentations = new Set<string>();
    for (const view of workspace.presentations) {
      if (!isRecord(view) || !hasOnlyKeys(view, ['id', 'worksiteId', 'kind', 'closed', 'layout'])
        || !isId(view.id) || presentations.has(view.id) || !isId(view.worksiteId)
        || !isKind(view.kind) || typeof view.closed !== 'boolean' || !isLayout(view.layout)) {
        return fail('INVALID_WORKSPACE', '呈现字段、唯一标识或布局无效');
      }
      if (!sites.has(view.worksiteId)) return fail('MISSING_WORKSITE', `呈现引用的现场不存在: ${view.worksiteId}`);
      presentations.add(view.id);
    }
    return { ok: true, value: cloneWorkspace(workspace as unknown as WorkspaceState) };
  } catch {
    return fail('INVALID_WORKSPACE', '工作区无法读取');
  }
}

/** unknown 命令先校验，再取允许字段；事件和 reducer 使用同一命令副本。 */
export function validateWorksiteCommand(command: unknown): CommandResult {
  try {
    command = snapshotPlainData(command);
    if (!isRecord(command)) return fail('INVALID_COMMAND', '命令必须为对象');
    switch (command.type) {
      case 'worksite.create':
        if (!hasOnlyKeys(command, ['type', 'id', 'assetId', 'conversationId']) || !isId(command.id)
          || (owns(command, 'assetId') && !isNullableId(command.assetId))
          || (owns(command, 'conversationId') && !isNullableId(command.conversationId))) break;
        return { ok: true, value: {
          type: command.type, id: command.id,
          ...(owns(command, 'assetId') ? { assetId: command.assetId as string | null } : {}),
          ...(owns(command, 'conversationId') ? { conversationId: command.conversationId as string | null } : {}),
        } };
      case 'worksite.activate':
        if (!hasOnlyKeys(command, ['type', 'worksiteId']) || !isId(command.worksiteId)) break;
        return { ok: true, value: { type: command.type, worksiteId: command.worksiteId } };
      case 'worksite.update':
        if (!hasOnlyKeys(command, ['type', 'worksiteId', 'draft', 'agentId']) || !isId(command.worksiteId)
          || (owns(command, 'draft') && typeof command.draft !== 'string')
          || (owns(command, 'agentId') && !isNullableId(command.agentId))) break;
        return { ok: true, value: {
          type: command.type, worksiteId: command.worksiteId,
          ...(owns(command, 'draft') ? { draft: command.draft as string } : {}),
          ...(owns(command, 'agentId') ? { agentId: command.agentId as string | null } : {}),
        } };
      case 'worksite.supply':
        if (!hasOnlyKeys(command, ['type', 'worksiteId', 'assetId', 'mode']) || !isId(command.worksiteId)
          || !isId(command.assetId) || !['connect', 'exclude', 'suggest'].includes(command.mode as string)) break;
        return { ok: true, value: {
          type: command.type, worksiteId: command.worksiteId, assetId: command.assetId,
          mode: command.mode as 'connect' | 'exclude' | 'suggest',
        } };
      case 'presentation.open':
        if (!hasOnlyKeys(command, ['type', 'id', 'worksiteId', 'kind', 'layout']) || !isId(command.id)
          || !isId(command.worksiteId) || (owns(command, 'kind') && !isKind(command.kind))
          || (owns(command, 'layout') && !isLayout(command.layout))) break;
        return { ok: true, value: {
          type: command.type, id: command.id, worksiteId: command.worksiteId,
          ...(owns(command, 'kind') ? { kind: command.kind as PresentationState['kind'] } : {}),
          ...(owns(command, 'layout') ? { layout: copyLayout(command.layout as PresentationLayout) } : {}),
        } };
      case 'presentation.update':
        if (!hasOnlyKeys(command, ['type', 'presentationId', 'kind', 'closed', 'layout']) || !isId(command.presentationId)
          || (owns(command, 'kind') && !isKind(command.kind))
          || (owns(command, 'closed') && typeof command.closed !== 'boolean')
          || (owns(command, 'layout') && !isLayout(command.layout, true))) break;
        return { ok: true, value: {
          type: command.type, presentationId: command.presentationId,
          ...(owns(command, 'kind') ? { kind: command.kind as PresentationState['kind'] } : {}),
          ...(owns(command, 'closed') ? { closed: command.closed as boolean } : {}),
          ...(owns(command, 'layout') ? { layout: { ...(command.layout as Partial<PresentationLayout>) } } : {}),
        } };
      default:
        return fail('UNKNOWN_COMMAND', '不支持的工作区命令');
    }
    return fail('INVALID_COMMAND', '命令字段无效');
  } catch {
    return fail('INVALID_COMMAND', '命令无法读取');
  }
}

/** 不写入入参，不复制资产内容；排除只能由显式 connect 撤销。 */
export function reduceWorkspace(state: WorkspaceState, command: unknown, assetIds: Iterable<string>): WorkspaceResult {
  const assets = new Set(assetIds);
  const validatedState = validateWorkspace(state, assets);
  if (!validatedState.ok) return validatedState;
  const validatedCommand = validateWorksiteCommand(command);
  if (!validatedCommand.ok) return validatedCommand;
  const next = validatedState.value;
  const op = validatedCommand.value;

  if (op.type === 'worksite.create') {
    if (next.worksites.some((site) => site.id === op.id)) return fail('ALREADY_EXISTS', `现场已存在: ${op.id}`);
    if (op.assetId != null && !assets.has(op.assetId)) return fail('MISSING_ASSET', `资产不存在: ${op.assetId}`);
    next.worksites.push({
      id: op.id, assetId: op.assetId ?? null, conversationId: op.conversationId ?? null,
      draft: '', agentId: null, checkedIds: [], excludedIds: [],
    });
  } else if (op.type === 'presentation.update') {
    const view = next.presentations.find((item) => item.id === op.presentationId);
    if (!view) return fail('NOT_FOUND', `呈现不存在: ${op.presentationId}`);
    if (op.kind !== undefined) view.kind = op.kind;
    if (op.closed !== undefined) view.closed = op.closed;
    if (op.layout !== undefined) view.layout = { ...view.layout, ...op.layout };
  } else {
    const site: WorksiteState | undefined = next.worksites.find((item) => item.id === op.worksiteId);
    if (!site) return fail('NOT_FOUND', `现场不存在: ${op.worksiteId}`);
    if (op.type === 'worksite.activate') next.activeWorksiteId = site.id;
    else if (op.type === 'worksite.update') {
      if (op.draft !== undefined) site.draft = op.draft;
      if (op.agentId !== undefined) site.agentId = op.agentId;
    } else if (op.type === 'worksite.supply') {
      if (!assets.has(op.assetId)) return fail('MISSING_ASSET', `资产不存在: ${op.assetId}`);
      if (op.mode === 'exclude') {
        site.checkedIds = site.checkedIds.filter((id) => id !== op.assetId);
        if (!site.excludedIds.includes(op.assetId)) site.excludedIds.push(op.assetId);
      } else if (op.mode === 'connect' || !site.excludedIds.includes(op.assetId)) {
        if (op.mode === 'connect') site.excludedIds = site.excludedIds.filter((id) => id !== op.assetId);
        if (!site.checkedIds.includes(op.assetId)) site.checkedIds.push(op.assetId);
      }
    } else if (op.type === 'presentation.open') {
      if (next.presentations.some((view) => view.id === op.id)) return fail('ALREADY_EXISTS', `呈现已存在: ${op.id}`);
      next.presentations.push({
        id: op.id, worksiteId: site.id, kind: op.kind ?? 'window', closed: false,
        layout: op.layout !== undefined ? copyLayout(op.layout) : { x: 0, y: 0 },
      });
    }
  }
  return { ok: true, value: next };
}
