import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  FIREBASE_RULES_OWNER_UID,
  FIREBASE_RULES_WORKSPACE_ID,
  firebaseOwnerBindingMatchesRules,
} from './firebaseRulesBinding.ts';

test('client owner and workspace bindings match Firestore Rules', () => {
  const rules = readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8');
  const ownerUid = rules.match(/request\.auth\.uid == '([^']+)'/)?.[1];
  const workspaceId = rules.match(/workspaceId == '([^']+)'/)?.[1];

  assert.equal(ownerUid, FIREBASE_RULES_OWNER_UID);
  assert.equal(workspaceId, FIREBASE_RULES_WORKSPACE_ID);
  assert.equal(firebaseOwnerBindingMatchesRules(ownerUid ?? '', workspaceId ?? ''), true);
});

test('a mismatched owner or workspace keeps the CRM configuration closed', () => {
  assert.equal(firebaseOwnerBindingMatchesRules('different-owner', FIREBASE_RULES_WORKSPACE_ID), false);
  assert.equal(firebaseOwnerBindingMatchesRules(FIREBASE_RULES_OWNER_UID, 'different-workspace'), false);
  assert.equal(firebaseOwnerBindingMatchesRules('', ''), false);
});
