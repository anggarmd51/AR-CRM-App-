import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, runTransaction, serverTimestamp, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import {
  FIREBASE_RULES_OWNER_UID,
  FIREBASE_RULES_WORKSPACE_ID,
  FIREBASE_STAGING_WORKSPACE_ID,
} from './src/firebaseRulesBinding.ts';
import { setDocWithServerReconciliation } from './src/utils/idempotentFirestoreCreate.ts';

const rulesTarget = process.env.FIRESTORE_RULES_TARGET === 'staging' ? 'staging' : 'production';
const projectId = rulesTarget === 'staging' ? 'demo-ar-crm-staging-rules' : 'demo-ar-crm-rules';
function readPrivateStagingOwnerUid(): string {
  const envText = readFileSync(new URL('./.env.staging.local', import.meta.url), 'utf8');
  const value = envText.split(/\r?\n/).find((line) => line.startsWith('VITE_FIREBASE_OWNER_UID='))
    ?.slice('VITE_FIREBASE_OWNER_UID='.length).trim().replace(/^['"]|['"]$/g, '');
  assert.ok(value && /^[A-Za-z0-9_-]{28}$/.test(value), 'staging owner UID is missing or invalid');
  return value;
}

const expectedBoundOwner = rulesTarget === 'staging' ? readPrivateStagingOwnerUid() : FIREBASE_RULES_OWNER_UID;
const expectedBoundWorkspace = rulesTarget === 'staging' ? FIREBASE_STAGING_WORKSPACE_ID : FIREBASE_RULES_WORKSPACE_ID;
const ownerUid = 'synthetic-designated-owner';
const otherUid = 'other-synthetic-user';
const workspace = 'synthetic-workspace';
const otherWorkspace = 'other-workspace';
const deniedWorkspace = 'unassigned-workspace';
const wrongRoleWorkspace = 'wrong-role-workspace';
const wrongRootWorkspace = 'wrong-root-workspace';
const activePinSessionId = 'a'.repeat(43);
const expiredPinSessionId = 'e'.repeat(43);
const revokedPinSessionId = 'r'.repeat(43);
const wrongOwnerPinSessionId = 'w'.repeat(43);
let env: RulesTestEnvironment;
let lockedEnv: RulesTestEnvironment;
type RulesEmulatorFirestore = ReturnType<ReturnType<RulesTestEnvironment['unauthenticatedContext']>['firestore']>;

const createdAt = Timestamp.fromDate(new Date('2026-01-01T00:00:00.000Z'));
const updatedAt = Timestamp.fromDate(new Date('2026-01-02T00:00:00.000Z'));

function validLead(ownerId = ownerUid) {
  return {
    company_name: 'Synthetic Co',
    contact_person: 'Synthetic Contact',
    phone: '+628123456789',
    industry: 'Synthetic Industry',
    city: 'Synthetic City',
    pipeline_stage: 'Prospect',
    deal_value: 0,
    next_followup_date: '',
    lead_score: 'Unrated',
    ownerId,
    role: 'owner',
    created_at: createdAt,
    updated_at: updatedAt,
  };
}

function validActivity(leadId: string, ownerId = ownerUid) {
  return {
    lead_id: leadId,
    activity_type: 'Call',
    notes: 'Synthetic note',
    ownerId,
    role: 'owner',
    created_at: createdAt,
  };
}

function validWonArchive(leadId: string, ownerId = ownerUid) {
  return {
    lead_id: leadId,
    company_name: 'Synthetic Co',
    contact_person: 'Synthetic Contact',
    phone: '+628123456789',
    industry: 'Synthetic Industry',
    city: 'Synthetic City',
    deal_value: 0,
    won_date: '2026-01-03',
    archived_at: createdAt,
    ownerId,
    role: 'owner',
  };
}

async function recordSyntheticFailedPinAttempt(db: RulesEmulatorFirestore, uid: string): Promise<number> {
  return db.runTransaction(async (transaction) => {
    const limitRef = db.doc(`accountPinRateLimits/${uid}`);
    const snapshot = await transaction.get(limitRef);
    const nextCount = Number(snapshot.get('failedAttempts') ?? 0) + 1;
    transaction.set(limitRef, { failedAttempts: nextCount });
    return nextCount;
  });
}

function ownerWithActivePinSession() {
  return env.authenticatedContext(ownerUid, { pinSessionId: activePinSessionId }).firestore();
}

before(async () => {
  const rulesFile = rulesTarget === 'staging' ? './firestore.staging.rules' : './firestore.rules';
  const sourceRules = readFileSync(new URL(rulesFile, import.meta.url), 'utf8');
  // Replace only the single explicit owner/workspace bindings in emulator rules;
  // all fixtures and project IDs remain synthetic.
  const ownerMatches = [...sourceRules.matchAll(/request\.auth\.uid == '([^']+)'/g)];
  const workspaceMatches = [...sourceRules.matchAll(/workspaceId == '([^']+)'/g)];
  assert.equal(ownerMatches.length, 1, 'expected exactly one designated-owner binding');
  assert.equal(workspaceMatches.length, 1, 'expected exactly one configured-workspace binding');
  const configuredOwner = ownerMatches[0][1];
  const configuredWorkspace = workspaceMatches[0][1];
  assert.ok(configuredOwner === expectedBoundOwner, 'Rules owner binding mismatch');
  assert.ok(configuredWorkspace === expectedBoundWorkspace, 'Rules workspace binding mismatch');
  const ownerClause = `request.auth.uid == '${configuredOwner}'`;
  const workspaceClause = `workspaceId == '${configuredWorkspace}'`;
  const configuredRules = sourceRules
    .replace(ownerClause, `request.auth.uid == '${ownerUid}'`)
    .replace(workspaceClause, `workspaceId == '${workspace}'`);
  const lockedRules = sourceRules
    .replace(ownerClause, "request.auth.uid == '__CONFIGURE_OWNER_UID__'")
    .replace(workspaceClause, `workspaceId == '${workspace}'`);
  env = await initializeTestEnvironment({ projectId, firestore: { rules: configuredRules } });
  lockedEnv = await initializeTestEnvironment({ projectId: `${projectId}-locked`, firestore: { rules: lockedRules } });
  // This test owns only the synthetic demo project namespaces; clear them so
  // repeated runs against an already-running local emulator stay deterministic.
  await env.clearFirestore();
  await lockedEnv.clearFirestore();
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'workspaces', workspace), { ownerId: ownerUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', workspace, 'members', ownerUid), { role: 'owner' });
    await setDoc(doc(db, 'workspaces', workspace, 'members', otherUid), { role: 'member' });
    await setDoc(doc(db, 'accountPinSessions', activePinSessionId), {
      ownerUid,
      status: 'active',
      expiresAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')),
    });
    await setDoc(doc(db, 'accountPinSessions', expiredPinSessionId), {
      ownerUid,
      status: 'active',
      expiresAt: Timestamp.fromDate(new Date('2020-01-01T00:00:00.000Z')),
    });
    await setDoc(doc(db, 'accountPinSessions', revokedPinSessionId), {
      ownerUid,
      status: 'revoked',
      expiresAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')),
    });
    await setDoc(doc(db, 'accountPinSessions', wrongOwnerPinSessionId), {
      ownerUid: otherUid,
      status: 'active',
      expiresAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')),
    });

    await setDoc(doc(db, 'workspaces', otherWorkspace), { ownerId: ownerUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', otherWorkspace, 'members', ownerUid), { role: 'owner' });

    await setDoc(doc(db, 'workspaces', deniedWorkspace), { ownerId: otherUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', deniedWorkspace, 'members', otherUid), { role: 'owner' });

    await setDoc(doc(db, 'workspaces', wrongRoleWorkspace), { ownerId: ownerUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', wrongRoleWorkspace, 'members', ownerUid), { role: 'member' });
    await setDoc(doc(db, 'workspaces', wrongRootWorkspace), { ownerId: otherUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', wrongRootWorkspace, 'members', ownerUid), { role: 'owner' });

    await setDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead'), validLead());
    await setDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'other-owned-lead'), validLead());
    await setDoc(doc(db, 'workspaces', workspace, 'leads', 'shared-lead-id'), validLead());
    await setDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'shared-lead-id'), validLead());
    await setDoc(doc(db, 'workspaces', workspace, 'leads', 'malformed-parent'), { ...validLead(), pipeline_stage: 'Invalid' });
    await setDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'unassigned-lead'), validLead(otherUid));
    await setDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity'), validActivity('owned-lead'));
    await setDoc(doc(db, 'workspaces', otherWorkspace, 'activities', 'other-activity'), validActivity('shared-lead-id'));
  });
});

after(async () => { await env?.cleanup(); await lockedEnv?.cleanup(); });

test('unauthenticated and non-owner users cannot read or write owner data', async () => {
  const unauth = env.unauthenticatedContext().firestore();
  const other = env.authenticatedContext(otherUid).firestore();
  await assertFails(getDoc(doc(unauth, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(getDoc(doc(unauth, 'workspaces', workspace, 'activities', 'existing-activity')));
  await assertFails(getDoc(doc(other, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(getDoc(doc(other, 'workspaces', workspace, 'activities', 'existing-activity')));
  await assertFails(setDoc(doc(other, 'workspaces', workspace, 'leads', 'other-lead'), validLead(otherUid)));
});

test('owner access requires an active, unexpired, UID-bound server PIN session', async () => {
  const ownerWithoutClaim = env.authenticatedContext(ownerUid).firestore();
  const ownerWithMissingSession = env.authenticatedContext(ownerUid, { pinSessionId: 'm'.repeat(43) }).firestore();
  const ownerWithExpiredSession = env.authenticatedContext(ownerUid, { pinSessionId: expiredPinSessionId }).firestore();
  const ownerWithRevokedSession = env.authenticatedContext(ownerUid, { pinSessionId: revokedPinSessionId }).firestore();
  const ownerWithForeignSession = env.authenticatedContext(ownerUid, { pinSessionId: wrongOwnerPinSessionId }).firestore();

  for (const db of [ownerWithoutClaim, ownerWithMissingSession, ownerWithExpiredSession, ownerWithRevokedSession, ownerWithForeignSession]) {
    await assertFails(getDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead')));
    await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'pin-gated-write'), validLead()));
  }

  const activeOwner = ownerWithActivePinSession();
  await assertFails(getDoc(doc(activeOwner, 'accountPinSessions', activePinSessionId)));
  await assertFails(setDoc(doc(activeOwner, 'accountPinSessions', 'c'.repeat(43)), {
    ownerUid,
    status: 'active',
    expiresAt: Timestamp.fromDate(new Date('2099-01-01T00:00:00.000Z')),
  }));
});

test('designated owner can read and create a valid lead and same-workspace activity', async () => {
  const db = ownerWithActivePinSession();
  await assertSucceeds(getDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'leads', 'new-lead'), validLead()));
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'activities', 'activity-1'), validActivity('new-lead')));
});

test('ambiguous create retries reconcile exact server documents without relaxing Rules', async () => {
  const db = ownerWithActivePinSession();
  const leadReference = doc(db, 'workspaces', workspace, 'leads', 'reconciled-create-lead');
  const { created_at: _leadCreatedAt, updated_at: _leadUpdatedAt, ...expectedLead } = validLead();
  const leadWrite = () => ({ ...expectedLead, created_at: serverTimestamp(), updated_at: serverTimestamp() });
  await setDocWithServerReconciliation(leadReference, leadWrite(), expectedLead);
  await setDocWithServerReconciliation(leadReference, leadWrite(), expectedLead);

  const activityReference = doc(db, 'workspaces', workspace, 'activities', 'reconciled-create-activity');
  const { created_at: _activityCreatedAt, ...expectedActivity } = validActivity('reconciled-create-lead');
  const activityWrite = () => ({ ...expectedActivity, created_at: serverTimestamp() });
  await setDocWithServerReconciliation(activityReference, activityWrite(), expectedActivity);
  await setDocWithServerReconciliation(activityReference, activityWrite(), expectedActivity);
  await assertSucceeds(getDoc(leadReference));
  await assertSucceeds(getDoc(activityReference));
});

test('owner cannot access a workspace without matching root ownership and membership', async () => {
  const db = ownerWithActivePinSession();
  await assertFails(getDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'other-owned-lead')));
  await assertFails(getDoc(doc(db, 'workspaces', otherWorkspace, 'activities', 'other-activity')));
  await assertFails(setDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'blocked-extra-workspace'), validLead()));
  await assertFails(getDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'unassigned-lead')));
  await assertFails(setDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'tampered-workspace'), validLead()));
  await assertFails(setDoc(doc(db, 'workspaces', deniedWorkspace, 'activities', 'tampered-workspace-activity'), validActivity('unassigned-lead')));
  await assertFails(setDoc(doc(db, 'workspaces', wrongRoleWorkspace, 'leads', 'tampered-membership-role'), validLead()));
  await assertFails(setDoc(doc(db, 'workspaces', wrongRootWorkspace, 'leads', 'tampered-root-owner'), validLead()));
});

test('ownerId-scoped application queries succeed but unfiltered collection reads fail', async () => {
  const db = ownerWithActivePinSession();
  await assertSucceeds(getDocs(query(collection(db, 'workspaces', workspace, 'leads'), where('ownerId', '==', ownerUid), orderBy('created_at', 'desc'))));
  await assertSucceeds(getDocs(query(collection(db, 'workspaces', workspace, 'activities'), where('ownerId', '==', ownerUid), orderBy('created_at', 'desc'))));
  await assertFails(getDocs(collection(db, 'workspaces', workspace, 'leads')));
  await assertFails(getDocs(collection(db, 'workspaces', workspace, 'activities')));
});

test('clients cannot create or alter workspace ownership or membership/role records', async () => {
  const db = ownerWithActivePinSession();
  await assertFails(setDoc(doc(db, 'workspaces', 'client-created'), { ownerId: ownerUid, created_at: createdAt }));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace), { ownerId: otherUid }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'members', 'new-member'), { role: 'owner' }));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace, 'members', ownerUid), { role: 'member' }));
});

test('owner identity and role cannot be changed on a lead', async () => {
  const db = ownerWithActivePinSession();
  const lead = doc(db, 'workspaces', workspace, 'leads', 'owned-lead');
  await assertFails(updateDoc(lead, { ownerId: 'changed-owner' }));
  await assertFails(updateDoc(lead, { role: 'member' }));
  await assertFails(updateDoc(lead, { created_at: updatedAt }));
  await assertFails(updateDoc(lead, { company_name: 'tampered name' }));
  await assertSucceeds(updateDoc(lead, { pipeline_stage: 'Meeting', updated_at: updatedAt }));
});

test('activity parent lookup is workspace-scoped and requires a valid lead schema', async () => {
  const db = ownerWithActivePinSession();
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'missing-lead'), validActivity('does-not-exist')));
  // A lead ID that exists only in another workspace cannot satisfy this path lookup.
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'cross-workspace'), validActivity('other-owned-lead')));
  // Matching IDs in two workspaces resolve only to the valid parent in this workspace.
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'activities', 'local-parent'), validActivity('shared-lead-id')));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'malformed-parent'), validActivity('malformed-parent')));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity'), { notes: 'cannot edit activity' }));
});

test('client deletions are denied even to the designated owner', async () => {
  const db = ownerWithActivePinSession();
  await assertFails(deleteDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(deleteDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity')));
});

test('lead and activity schemas reject tampered ownership, role, type, malformed GPS, summary provenance and unknown fields', async () => {
  const db = ownerWithActivePinSession();
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'forged-owner'), validLead(otherUid)));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'forged-role'), { ...validLead(), role: 'admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-stage'), { ...validLead(), pipeline_stage: 'Admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'empty-contact'), { ...validLead(), contact_person: '' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'numeric-phone'), { ...validLead(), phone: 812345678 }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-value'), { ...validLead(), deal_value: 'large' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-date'), { ...validLead(), next_followup_date: 'tomorrow' }));
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'leads', 'valid-leap-date'), { ...validLead(), next_followup_date: '2024-02-29' }));
  for (const date of ['2026-99-99', '2026-02-29', '2026-04-31', '0000-01-01']) {
    await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', `impossible-date-${date}`), { ...validLead(), next_followup_date: date }));
  }
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'gps-injected'), { ...validLead(), location_gps: '0,0', latitude: 0, longitude: 0, coords: { lat: 0, lng: 0 } }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'unknown-field'), { ...validLead(), unknown_field: 'denied' }));

  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'forged-owner'), validActivity('owned-lead', otherUid)));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'forged-role'), { ...validActivity('owned-lead'), role: 'admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'gps-injected'), { ...validActivity('owned-lead'), location_gps: '0,0', latitude: 0, longitude: 0 }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'bad-gps-range'), { ...validActivity('owned-lead'), location_gps: { latitude: 91, longitude: 0, accuracy_m: 10 } }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'summary-without-source'), { ...validActivity('owned-lead'), ai_summary: 'Ringkasan sintetis.' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'bad-summary-source'), { ...validActivity('owned-lead'), ai_summary: 'Ringkasan sintetis.', ai_summary_source: 'unknown' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'unknown-field'), { ...validActivity('owned-lead'), unknown_field: 'denied' }));
});

test('activity accepts bounded summary provenance and explicitly captured GPS only', async () => {
  const db = ownerWithActivePinSession();
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'activities', 'valid-summary-gps'), {
    ...validActivity('owned-lead'),
    ai_summary: 'Ringkasan sintetis yang ditinjau pemilik.',
    ai_summary_source: 'local',
    location_gps: { latitude: -6.2, longitude: 106.8, accuracy_m: 18 },
  }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'long-summary'), {
    ...validActivity('owned-lead'),
    ai_summary: 'S'.repeat(4001),
    ai_summary_source: 'gemini',
  }));
});

test('won archive is owner-only, immutable, and created only with the lead closing-won transition', async () => {
  const db = ownerWithActivePinSession();
  const archive = doc(db, 'workspaces', workspace, 'wonDealArchives', 'owned-lead');
  await assertFails(setDoc(archive, validWonArchive('owned-lead')));

  const lead = doc(db, 'workspaces', workspace, 'leads', 'owned-lead');
  await assertSucceeds(runTransaction(db, async (transaction) => {
    const leadSnapshot = await transaction.get(lead);
    assert.equal(leadSnapshot.exists(), true);
    transaction.update(lead, { pipeline_stage: 'Closing Won', updated_at: updatedAt });
    transaction.set(archive, { ...validWonArchive('owned-lead'), archived_at: serverTimestamp() });
  }));
  await assertSucceeds(getDoc(archive));
  await assertFails(updateDoc(archive, { deal_value: 1 }));
  await assertFails(deleteDoc(archive));
});

test('field length boundaries and update allowlists are enforced', async () => {
  const db = ownerWithActivePinSession();
  const maxLengthLead = {
    ...validLead(),
    company_name: 'C'.repeat(200),
    contact_person: 'P'.repeat(200),
    industry: 'I'.repeat(120),
    city: 'T'.repeat(120),
  };
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'leads', 'max-length-lead'), maxLengthLead));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'long-company'), { ...validLead(), company_name: 'C'.repeat(201) }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'long-contact'), { ...validLead(), contact_person: 'P'.repeat(201) }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'long-industry'), { ...validLead(), industry: 'I'.repeat(121) }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'long-city'), { ...validLead(), city: 'T'.repeat(121) }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'negative-value'), { ...validLead(), deal_value: -1 }));

  const maxLengthActivity = {
    ...validActivity('owned-lead'),
    activity_type: 'A'.repeat(80),
    notes: 'N'.repeat(12000),
  };
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'activities', 'max-length-activity'), maxLengthActivity));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'long-activity-type'), { ...validActivity('owned-lead'), activity_type: 'A'.repeat(81) }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'long-notes'), { ...validActivity('owned-lead'), notes: 'N'.repeat(12001) }));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead'), { pipeline_stage: 'Meeting', unexpected: true }));
});

test('Firestore Emulator transactions preserve shared PIN-attempt increments across two clients', async () => {
  await env.withSecurityRulesDisabled(async (firstContext) => {
    const firstServerContextDb = firstContext.firestore();
    await env.withSecurityRulesDisabled(async (secondContext) => {
      const secondServerContextDb = secondContext.firestore();
      const attempts = await Promise.all(Array.from({ length: 16 }, (_, index) =>
        recordSyntheticFailedPinAttempt(index % 2 === 0 ? firstServerContextDb : secondServerContextDb, ownerUid),
      ));
      assert.deepEqual(attempts.slice().sort((left, right) => left - right), Array.from({ length: 16 }, (_, index) => index + 1));

      const stored = await firstServerContextDb.doc(`accountPinRateLimits/${ownerUid}`).get();
      assert.equal(stored.get('failedAttempts'), 16);
    });
  });
});

test('unknown collections and unconfigured rules remain denied', async () => {
  const owner = ownerWithActivePinSession();
  await assertFails(setDoc(doc(owner, 'unknown', 'synthetic'), { value: 'denied' }));
  await assertFails(getDoc(doc(owner, 'workspaces', workspace, 'unknown-subcollection', 'synthetic')));
  await assertFails(getDoc(doc(owner, 'accountPinRateLimits', ownerUid)));
  await assertFails(setDoc(doc(owner, 'accountPinRateLimits', ownerUid), { failedAttempts: 1 }));
  await assertFails(getDoc(doc(owner, 'accountPinCredentials', ownerUid)));
  await assertFails(setDoc(doc(owner, 'accountPinCredentials', ownerUid), {
    ownerUid,
    verifier: 'scrypt$16384$8$1$server-only',
  }));

  const unconfigured = lockedEnv.authenticatedContext(ownerUid).firestore();
  await assertFails(getDoc(doc(unconfigured, 'workspaces', workspace)));
  await assertFails(setDoc(doc(unconfigured, 'workspaces', workspace, 'leads', 'denied'), validLead()));
});
