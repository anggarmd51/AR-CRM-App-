import test from 'node:test';
import assert from 'node:assert/strict';
import { createAppHistoryState, getClosedModalNames, readAppHistoryState } from './appHistory.ts';

const tabs = ['dashboard', 'pipeline', 'leads_finder', 'activities', 'android_code'] as const;

test('app history restores the tab from the actual destination entry', () => {
  const previous = createAppHistoryState('pipeline');
  const destination = readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: [] }, tabs);

  assert.equal(previous.tab, 'pipeline');
  assert.equal(destination?.tab, 'dashboard');
  assert.deepEqual(getClosedModalNames(previous, destination!), []);
});

test('app history removes nested modals in LIFO order without losing the parent', () => {
  const previous = createAppHistoryState('activities', ['leadDetail', 'activityLogger']);
  const destination = createAppHistoryState('activities', ['leadDetail']);

  assert.deepEqual(getClosedModalNames(previous, destination), ['activityLogger']);
});

test('app history closes multiple removed modal layers from child to parent', () => {
  const previous = createAppHistoryState('dashboard', ['leadDetail', 'whatsapp', 'securitySettings']);
  const destination = createAppHistoryState('dashboard');

  assert.deepEqual(getClosedModalNames(previous, destination), ['securitySettings', 'whatsapp', 'leadDetail']);
});

test('history state parser accepts legacy tab entries but rejects invalid tabs and modal names', () => {
  assert.equal(readAppHistoryState({ tab: 'pipeline' }, tabs)?.tab, 'pipeline');
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'unknown', modalStack: [] }, tabs), null);
  assert.equal(readAppHistoryState({ __arCrmHistory: true, tab: 'dashboard', modalStack: ['unknown'] }, tabs), null);
});
