import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  FIREBASE_RULES_OWNER_UID,
  FIREBASE_RULES_WORKSPACE_ID,
  FIREBASE_STAGING_WORKSPACE_ID,
  firebaseOwnerBindingMatchesRules,
  firebaseStagingOwnerBindingMatchesRules,
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

test('staging binding rejects production UID and wrong workspace', () => {
  const firebaseModule = readFileSync(new URL('./firebase.ts', import.meta.url), 'utf8');
  assert.match(firebaseModule, /if \(firebaseTarget === 'staging'\) \{\s*return firebaseIsConfigured && firebaseStagingOwnerBindingMatchesRules\(designatedOwnerUid, workspaceId\);/);
  assert.match(firebaseModule, /if \(firebaseTarget === 'staging'\) \{\s*return Boolean\(uid && firebaseStagingOwnerBindingMatchesRules\(designatedOwnerUid, workspaceId\) && uid === designatedOwnerUid\);/);
  assert.equal(firebaseOwnerBindingMatchesRules(FIREBASE_RULES_OWNER_UID, FIREBASE_RULES_WORKSPACE_ID), true);
  assert.equal(firebaseStagingOwnerBindingMatchesRules('synthetic-staging-owner', FIREBASE_STAGING_WORKSPACE_ID), true);
  assert.equal(firebaseStagingOwnerBindingMatchesRules(FIREBASE_RULES_OWNER_UID, FIREBASE_STAGING_WORKSPACE_ID), false);
  assert.equal(firebaseStagingOwnerBindingMatchesRules('', FIREBASE_STAGING_WORKSPACE_ID), false);
  assert.equal(firebaseStagingOwnerBindingMatchesRules('staging-owner-uid', FIREBASE_RULES_WORKSPACE_ID), false);
});

test('generated private staging Rules match the configured staging owner exactly', { skip: !existsSync(new URL('../firestore.staging.rules', import.meta.url)) }, () => {
  const stagingRules = readFileSync(new URL('../firestore.staging.rules', import.meta.url), 'utf8');
  const stagingEnv = readFileSync(new URL('../.env.staging.local', import.meta.url), 'utf8');
  const configuredOwner = stagingEnv.split(/\r?\n/).find((line) => line.startsWith('VITE_FIREBASE_OWNER_UID='))?.slice('VITE_FIREBASE_OWNER_UID='.length).trim().replace(/^['"]|['"]$/g, '');
  const rulesOwner = stagingRules.match(/request\.auth\.uid == '([^']+)'/)?.[1];
  const rulesWorkspace = stagingRules.match(/workspaceId == '([^']+)'/)?.[1];
  assert.ok(configuredOwner && rulesOwner === configuredOwner, 'staging owner Rules binding mismatch');
  assert.ok(rulesWorkspace === FIREBASE_STAGING_WORKSPACE_ID, 'staging workspace Rules binding mismatch');
});
