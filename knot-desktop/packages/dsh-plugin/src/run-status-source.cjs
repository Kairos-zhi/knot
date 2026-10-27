const { createRunStatusView } = require('@kont/run-status-view');

/** One renderer owner for the public read-only query DTO. No phase inference,
 * model actions, workspace mutations, timers or per-presentation stores. */
exports.createRunStatusSource = function createRunStatusSource({ fetch, baseURI }) {
  let closed = false, generation = 0, pending, floor = 0;
  let snapshot = Object.freeze({ worksiteId: null, seq: null, runs: Object.freeze([]), loading: false, error: '' });
  const listeners = new Set();
  const emit = patch => {
    if (closed) return;
    snapshot = Object.freeze({ ...snapshot, ...patch });
    for (const listener of listeners) listener();
  };
  const refresh = async (worksiteId = snapshot.worksiteId, minimumSeq = floor) => {
    if (closed || !worksiteId) return;
    floor = Math.max(floor, minimumSeq);
    const own = ++generation;
    pending?.abort(); pending = new AbortController();
    const signal = pending.signal;
    emit({ worksiteId, runs: Object.freeze([]), loading: true, error: '' });
    try {
      const response = await fetch(new URL('kont/runs', baseURI), { method: 'GET', credentials: 'same-origin', signal });
      if (!response.ok) throw new Error('RUN_QUERY_FAILED');
      const body = await response.json();
      if (closed || own !== generation || signal.aborted) return;
      if (body?.ok !== true || !Number.isSafeInteger(body.seq) || body.seq < floor
        || !Array.isArray(body.runs) || body.runs.length > 200) throw new Error('RUN_QUERY_INVALID');
      const runs = body.runs.map(run => { createRunStatusView(run); return Object.freeze({ ...run }); });
      floor = body.seq;
      emit({ worksiteId, seq: body.seq, runs: Object.freeze(runs), loading: false, error: '' });
    } catch {
      if (!closed && own === generation && !signal.aborted)
        emit({ worksiteId, runs: Object.freeze([]), loading: false, error: '暂时无法读取运行状态，请刷新重试。' });
    }
  };
  return Object.freeze({
    read: () => snapshot,
    subscribe(listener) { if (closed) return () => {}; listeners.add(listener); return () => listeners.delete(listener); },
    invalidate(worksiteId = snapshot.worksiteId, error = '') {
      if (closed) return;
      ++generation; pending?.abort();
      emit({ worksiteId, runs: Object.freeze([]), loading: !error, error });
    },
    setWorksite(worksiteId, minimumSeq = 0) {
      if (closed) return;
      if (!worksiteId) { ++generation; pending?.abort(); emit({ worksiteId: null, seq: null, runs: Object.freeze([]), loading: false, error: '' }); return; }
      if (snapshot.worksiteId !== worksiteId || minimumSeq > floor || snapshot.seq === null && !snapshot.loading)
        return refresh(worksiteId, minimumSeq);
    },
    refresh,
    dispose() { if (closed) return; closed = true; ++generation; pending?.abort(); listeners.clear(); },
  });
};

/** Re-resolve history against the current kernel snapshot, without mutation. */
exports.resolveRunOutput = function resolveRunOutput(data, reference) {
  if (!data || !reference || data.workspace?.activeWorksiteId !== reference.worksiteId
    || !data.workspace.worksites.some(site => site.id === reference.worksiteId)) return null;
  const asset = data.assets.find(item => item.id === reference.assetId);
  const block = asset?.blocks?.find(item => item.id === reference.blockId);
  return block ? { title: asset.title, content: block.content } : null;
};
