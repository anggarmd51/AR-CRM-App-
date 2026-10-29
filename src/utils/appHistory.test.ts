import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppHistoryState, getClosedModalNames, getModalLeadId, readAppHistoryState } from './appHistory.ts';

const tabs = ['dashboard', 'pipeline', 'leads_finder', 'activities', 'android_code'] as const;

test('app history restores the tab from the actual destination entry', () => {
  const previous = createAppHistoryState('pipeline');
  const destination = readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: [] }, tabs);
  assert.equal(previous.tab, 'pipeline');
  assert.equal(destination?.tab, 'dashboard');
  assert.deepEqual(getClosedModalNames(previous, destination!), []);
});

test('app history removes nested modals in LIFO order without losing the parent', () => {
  const previous = createAppHistoryState('activities', ['leadDetail', 'activityLogger'], ['lead-1', 'lead-1']);
  const destination = createAppHistoryState('activities', ['leadDetail'], ['lead-1']);
  assert.deepEqual(getClosedModalNames(previous, destination), ['activityLogger']);
  assert.equal(getModalLeadId(destination, 'leadDetail'), 'lead-1');
});

test('app history closes multiple removed modal layers from child to parent', () => {
  const previous = createAppHistoryState('dashboard', ['leadDetail', 'whatsapp', 'securitySettings'], ['lead-1', 'lead-1', null]);
  const destination = createAppHistoryState('dashboard');
  assert.deepEqual(getClosedModalNames(previous, destination), ['securitySettings', 'whatsapp', 'leadDetail']);
});

test('history state parser accepts legacy entries and rejects invalid tabs, modal names, and IDs', () => {
  assert.equal(readAppHistoryState({ tab: 'pipeline' }, tabs)?.tab, 'pipeline');
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'unknown', modalStack: [] }, tabs), null);
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: ['unknown'] }, tabs), null);
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: ['leadDetail'], modalLeadIds: [42] }, tabs), null);
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: [], modalLeadIds: ['orphan-id'] }, tabs), null);
});

test('forward destination preserves tab and restores only the validated lead ID context', () => {
  const forward = readAppHistoryState({
    __arCrmHistory: true,
    tab: 'activities',
    modalStack: ['leadDetail', 'whatsapp'],
    modalLeadIds: ['lead-42', null],
  }, tabs)!;
  assert.equal(forward.tab, 'activities');
  assert.equal(getModalLeadId(forward, 'leadDetail'), 'lead-42');
  assert.equal(getModalLeadId(forward, 'whatsapp'), null);
});

import { canonicalizeModalHistoryState } from './appHistory.ts';

test('missing lead context drops only the unrestorable modal prefix and preserves the active tab', () => {
  const missingChild = createAppHistoryState('pipeline', ['leadDetail', 'whatsapp'], ['lead-1', 'missing']);
  const restored = canonicalizeModalHistoryState(missingChild, new Set(['lead-1']));
  assert.equal(restored.tab, 'pipeline');
  assert.deepEqual(restored.modalStack, ['leadDetail']);
  assert.deepEqual(canonicalizeModalHistoryState(createAppHistoryState('activities', ['leadDetail']), new Set()).modalStack, []);
  assert.deepEqual(canonicalizeModalHistoryState(createAppHistoryState('activities', ['activityLogger']), new Set()).modalStack, ['activityLogger']);
});

test('history IDs reject document paths, control characters and oversized values', () => {
  for (const id of ['path/to/lead', '.', '..', '\u0000hidden', 'x'.repeat(1501)]) {
    assert.equal(readAppHistoryState({ tab: 'pipeline', modalStack: ['leadDetail'], modalLeadIds: [id] }, tabs), null);
  }
  assert.deepEqual(createAppHistoryState('pipeline', ['quickLead', 'leadDetail'], [null, 'lead-1']).modalLeadIds, [null, 'lead-1']);
});

test('changing the Lead context closes the old same-name modal layer', () => {
  assert.deepEqual(getClosedModalNames(createAppHistoryState('pipeline', ['leadDetail'], ['lead-1']), createAppHistoryState('pipeline', ['leadDetail'], ['lead-2'])), ['leadDetail']);
});
