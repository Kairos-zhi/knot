import { getBlocks } from '../lib/knot-model.js';
import { reject } from './kernel.mjs';

/** Project a validated KontStore snapshot. Viewing does not change supply.
 * Keep the legacy preview shape; detach blocks including nested provenance and
 * metadata so direct callers cannot modify the snapshot through the result. */
export function createWorksitePreview(state, worksiteId) {
  const site = state.workspace.worksites.find(site => site.id === worksiteId);
  if (!site) {
    reject('NOT_FOUND', '现场不存在', 404);
  }

  const materials = [];
  for (const id of site.checkedIds) {
    if (site.excludedIds.includes(id)) continue;
    const asset = state.assets.find(asset => asset.id === id);
    if (!asset) {
      reject('INVALID_STORE', '现场供给引用的材料不存在', 503);
    }
    materials.push({
      id: asset.id,
      title: asset.title,
      summary: asset.summary,
      blocks: getBlocks(asset),
    });
  }
  return structuredClone({ worksiteId: site.id, draft: site.draft, materials });
}
