import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorkstationClient } from './helpers/workstation-client-fixture.mjs';

test('draft leave guard warns on actual edits and clears when text returns to the saved value', async t => {
  const saved = { revision: 1, seq: 1, assets: [], titles: { legacy: '现场' }, workspace: {
    activeWorksiteId: 'legacy', worksites: [{ id: 'legacy', draft: 'saved text', checkedIds: [], excludedIds: [] }], presentations: [],
  } };
  const client = await createWorkstationClient(saved);
  t.after(client.unmount);
  const textarea = client.node(node => node.type === 'textarea' && node.props['aria-label'] === '现场草稿');
  assert.ok(textarea);
  const checkLeave = () => {
    let prevented = false;
    client.events.get('beforeunload')({ preventDefault: () => { prevented = true; } });
    return prevented;
  };
  assert.equal(checkLeave(), false);
  // Direct component-callback contract checks; no browser/DOM or simulated click.
  textarea.props.onChange({ target: { value: 'edited text' } });
  assert.equal(checkLeave(), true);
  textarea.props.onChange({ target: { value: 'saved text' } });
  assert.equal(checkLeave(), false);
});
