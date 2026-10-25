import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, orderBy, query, setDoc, Timestamp, updateDoc, where } from 'firebase/firestore';
import { FIREBASE_RULES_OWNER_UID, FIREBASE_RULES_WORKSPACE_ID } from './src/firebaseRulesBinding.ts';

const projectId = 'demo-ar-crm-rules';
const ownerUid = 'synthetic-designated-owner';
const otherUid = 'other-synthetic-user';
const workspace = 'synthetic-workspace';
const otherWorkspace = 'other-workspace';
const deniedWorkspace = 'unassigned-workspace';
const wrongRoleWorkspace = 'wrong-role-workspace';
const wrongRootWorkspace = 'wrong-root-workspace';
let env: RulesTestEnvironment;
let productionEnv: RulesTestEnvironment;

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

before(async () => {
  const productionRules = readFileSync(new URL('./firestore.rules', import.meta.url), 'utf8');
  // Replace explicit production bindings in the emulator only; all fixtures stay synthetic.
  const ownerBinding = /request\.auth\.uid == '([^']+)'/;
  const workspaceBinding = /workspaceId == '([^']+)'/;
  const configuredOwner = productionRules.match(ownerBinding)?.[1];
  const configuredWorkspace = productionRules.match(workspaceBinding)?.[1];
  assert.equal(configuredOwner, FIREBASE_RULES_OWNER_UID);
  assert.equal(configuredWorkspace, FIREBASE_RULES_WORKSPACE_ID);
  const configuredRules = productionRules
    .replace(ownerBinding, `request.auth.uid == '${ownerUid}'`)
    .replace(workspaceBinding, `workspaceId == '${workspace}'`);
  const lockedRules = productionRules
    .replace(ownerBinding, "request.auth.uid == '__CONFIGURE_OWNER_UID__'")
    .replace(workspaceBinding, `workspaceId == '${workspace}'`);
  env = await initializeTestEnvironment({ projectId, firestore: { rules: configuredRules } });
  productionEnv = await initializeTestEnvironment({ projectId: `${projectId}-locked`, firestore: { rules: lockedRules } });
  await env.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, 'workspaces', workspace), { ownerId: ownerUid, created_at: createdAt });
    await setDoc(doc(db, 'workspaces', workspace, 'members', ownerUid), { role: 'owner' });
    await setDoc(doc(db, 'workspaces', workspace, 'members', otherUid), { role: 'member' });

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
    await setDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'unassigned-lead'), validLead(otherUid));
    await setDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity'), validActivity('owned-lead'));
  });
});

after(async () => { await env?.cleanup(); await productionEnv?.cleanup(); });

test('unauthenticated and non-owner users cannot read or write owner data', async () => {
  const unauth = env.unauthenticatedContext().firestore();
  const other = env.authenticatedContext(otherUid).firestore();
  await assertFails(getDoc(doc(unauth, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(getDoc(doc(other, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(setDoc(doc(other, 'workspaces', workspace, 'leads', 'other-lead'), validLead(otherUid)));
});

test('designated owner can read and create a valid lead and same-workspace activity', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(getDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'leads', 'new-lead'), validLead()));
  await assertSucceeds(setDoc(doc(db, 'workspaces', workspace, 'activities', 'activity-1'), validActivity('new-lead')));
});

test('owner cannot access a workspace without matching root ownership and membership', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertFails(getDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'other-owned-lead')));
  await assertFails(setDoc(doc(db, 'workspaces', otherWorkspace, 'leads', 'blocked-extra-workspace'), validLead()));
  await assertFails(getDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'unassigned-lead')));
  await assertFails(setDoc(doc(db, 'workspaces', deniedWorkspace, 'leads', 'tampered-workspace'), validLead()));
  await assertFails(setDoc(doc(db, 'workspaces', deniedWorkspace, 'activities', 'tampered-workspace-activity'), validActivity('unassigned-lead')));
  await assertFails(setDoc(doc(db, 'workspaces', wrongRoleWorkspace, 'leads', 'tampered-membership-role'), validLead()));
  await assertFails(setDoc(doc(db, 'workspaces', wrongRootWorkspace, 'leads', 'tampered-root-owner'), validLead()));
});

test('ownerId-scoped application queries succeed but unfiltered collection reads fail', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertSucceeds(getDocs(query(collection(db, 'workspaces', workspace, 'leads'), where('ownerId', '==', ownerUid), orderBy('created_at', 'desc'))));
  await assertSucceeds(getDocs(query(collection(db, 'workspaces', workspace, 'activities'), where('ownerId', '==', ownerUid), orderBy('created_at', 'desc'))));
  await assertFails(getDocs(collection(db, 'workspaces', workspace, 'leads')));
  await assertFails(getDocs(collection(db, 'workspaces', workspace, 'activities')));
});

test('clients cannot create or alter workspace ownership or membership/role records', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(doc(db, 'workspaces', 'client-created'), { ownerId: ownerUid, created_at: createdAt }));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace), { ownerId: otherUid }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'members', 'new-member'), { role: 'owner' }));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace, 'members', ownerUid), { role: 'member' }));
});

test('owner identity and role cannot be changed on a lead', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  const lead = doc(db, 'workspaces', workspace, 'leads', 'owned-lead');
  await assertFails(updateDoc(lead, { ownerId: 'changed-owner' }));
  await assertFails(updateDoc(lead, { role: 'member' }));
  await assertFails(updateDoc(lead, { created_at: updatedAt }));
  await assertFails(updateDoc(lead, { company_name: 'tampered name' }));
  await assertSucceeds(updateDoc(lead, { pipeline_stage: 'Meeting', updated_at: updatedAt }));
});

test('activities require a same-workspace lead owned by the authenticated owner', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'missing-lead'), validActivity('does-not-exist')));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'cross-workspace'), validActivity('other-owned-lead')));
  await assertFails(updateDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity'), { notes: 'cannot edit activity' }));
});

test('client deletions are denied even to the designated owner', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertFails(deleteDoc(doc(db, 'workspaces', workspace, 'leads', 'owned-lead')));
  await assertFails(deleteDoc(doc(db, 'workspaces', workspace, 'activities', 'existing-activity')));
});

test('lead and activity schemas reject tampered ownership, role, type, enum, GPS, AI-summary and unknown fields', async () => {
  const db = env.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'forged-owner'), validLead(otherUid)));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'forged-role'), { ...validLead(), role: 'admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-stage'), { ...validLead(), pipeline_stage: 'Admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-value'), { ...validLead(), deal_value: 'large' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'bad-date'), { ...validLead(), next_followup_date: 'tomorrow' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'gps-injected'), { ...validLead(), location_gps: '0,0', latitude: 0, longitude: 0, coords: { lat: 0, lng: 0 } }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'leads', 'unknown-field'), { ...validLead(), unknown_field: 'denied' }));

  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'forged-owner'), validActivity('owned-lead', otherUid)));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'forged-role'), { ...validActivity('owned-lead'), role: 'admin' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'gps-injected'), { ...validActivity('owned-lead'), location_gps: '0,0', latitude: 0, longitude: 0 }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'ai-summary'), { ...validActivity('owned-lead'), ai_summary: 'not part of current client-write schema' }));
  await assertFails(setDoc(doc(db, 'workspaces', workspace, 'activities', 'unknown-field'), { ...validActivity('owned-lead'), unknown_field: 'denied' }));
});

test('unknown collections and unconfigured production rules remain denied', async () => {
  const owner = env.authenticatedContext(ownerUid).firestore();
  await assertFails(setDoc(doc(owner, 'unknown', 'synthetic'), { value: 'denied' }));
  await assertFails(getDoc(doc(owner, 'workspaces', workspace, 'unknown-subcollection', 'synthetic')));

  const unconfigured = productionEnv.authenticatedContext(ownerUid).firestore();
  await assertFails(getDoc(doc(unconfigured, 'workspaces', workspace)));
  await assertFails(setDoc(doc(unconfigured, 'workspaces', workspace, 'leads', 'denied'), validLead()));
});
