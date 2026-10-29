import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../components/ActivityLoggerModal.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../firebaseRepository.ts', import.meta.url), 'utf8');
const authGate = readFileSync(new URL('../components/FirebaseAuthGate.tsx', import.meta.url), 'utf8');
const app = readFileSync(new URL('../App.tsx', import.meta.url), 'utf8');
const topAppBar = readFileSync(new URL('../components/TopAppBar.tsx', import.meta.url), 'utf8');
const accountPinGate = readFileSync(new URL('../components/AccountPinGate.tsx', import.meta.url), 'utf8');
const accountPinClient = readFileSync(new URL('../accountPinClient.ts', import.meta.url), 'utf8');
const localSecurityPolicy = readFileSync(new URL('../localSecurityPolicy.ts', import.meta.url), 'utf8');
const firestoreRules = readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');

test('activity logger requires explicit consent for notes-only Gemini and user-triggered one-shot GPS', () => {
  assert.match(modal, /fetch\('\/api\/ai\/summarize-notes'/);
  assert.match(modal, /!aiSummarizerEnabled \|\| !aiConsent/);
  assert.match(modal, /body: JSON\.stringify\(\{ notes: notes\.trim\(\) \}\)/);
  assert.doesNotMatch(modal, /body: JSON\.stringify\(\{[^}]*lead_id|body: JSON\.stringify\(\{[^}]*contactPerson|body: JSON\.stringify\(\{[^}]*companyName/);
  assert.match(modal, /summarizeMeetingNotesLocally\(notes\)/);
  assert.match(modal, /getCurrentPosition/);
  assert.match(modal, /maximumAge: 0/);
  assert.match(modal, /tidak ada pelacakan latar belakang/);
  assert.match(app, /VITE_AI_MEETING_SUMMARIZER_ENABLED === 'true'/);
});

test('server notes summarizer is disabled before request-body processing or model access', () => {
  assert.match(server, /app\.post\('\/api\/ai\/summarize-notes', \(_req, res\) => \{\s*res\.status\(403\)/);
  assert.doesNotMatch(server, /generateStructuredMeetingSummary|rawNotes|contactPerson|companyName|generateContent/);
});

test('activity repository writes only explicit note, approved summary, and optional GPS fields', () => {
  assert.match(repository, /lead_id: activity\.lead_id/);
  assert.match(repository, /activity_type: activity\.activity_type/);
  assert.match(repository, /notes: activity\.notes/);
  assert.match(repository, /ai_summary: activity\.ai_summary/);
  assert.match(repository, /ai_summary_source: activity\.ai_summary_source/);
  assert.match(repository, /location_gps: activity\.location_gps/);
  assert.match(firestoreRules, /validActivityGps/);
  assert.match(firestoreRules, /data\.ai_summary_source in \['gemini', 'local'\]/);
});

test('active CRM routes use the Firestore queue module, not the legacy localStorage CRM module', () => {
  for (const source of [app, repository, authGate]) {
    assert.match(source, /utils\/offlineWriteQueue\.ts/);
    assert.doesNotMatch(source, /utils\/syncQueue\.ts/);
  }
});

test('owner bootstrap exposes UID/email only and keeps unconfigured CRM children closed', () => {
  assert.match(authGate, /isOwnerBootstrapEnabled\(import\.meta\.env\.DEV, window\.location\.hostname, window\.location\.protocol, firebaseTarget\)/);
  assert.match(authGate, /if \(!hasWorkspaceConfiguration\(\) && !isOwnerBootstrapEnabled/);
  assert.match(authGate, /if \(!hasWorkspaceConfiguration\(\)\) \{\s*return <OwnerBootstrapMessage user=\{user\} onSignOut=\{handleSignOut\} \/>/);
  assert.ok(authGate.indexOf('return <OwnerBootstrapMessage') < authGate.indexOf('{children}'));
  assert.match(authGate, /Firebase Auth UID/);
  assert.match(authGate, /user\.uid/);
  assert.doesNotMatch(authGate, /getIdToken|accessToken|refreshToken|credentialFromResult|localStorage|setDoc|addDoc|onSnapshot/);
});

test('hosted CRM opens only after the signed claim and server session document are verified', () => {
  assert.match(authGate, /onIdTokenChanged/);
  assert.match(authGate, /const status = await accountPinClient\.fetchStatus\(nextUser\)/);
  assert.match(authGate, /if \(status\.sessionActive\) \{[\s\S]{0,250}await activateFirestoreWriteQueue\(nextUser\.uid\)/);
  assert.match(authGate, /accountPinGateState !== 'verified' \|\| sessionRevalidating/);
  assert.ok(authGate.indexOf('accountPinGateState !== \'verified\'') < authGate.indexOf('{children}'));
  assert.match(accountPinClient, /signInWithCustomToken/);
  assert.match(accountPinClient, /const sessionActive = response\.sessionActive && hasWellFormedSessionClaim/);
  assert.match(accountPinClient, /cache: 'no-store'/);
  assert.doesNotMatch(accountPinClient, /localStorage|SecurityVault/);
  assert.doesNotMatch(accountPinGate, /localStorage\.|SecurityVault\./);
  assert.match(firestoreRules, /&& accountPinSessionVerified\(\)/);
  assert.match(firestoreRules, /request\.auth\.token\.get\('pinSessionId', ''\)/);
  assert.match(firestoreRules, /get\(sessionPath\)\.data\.expiresAt > request\.time/);
  assert.match(firestoreRules, /match \/\{document=\*\*\} \{\s*allow read, write: if false;/);
});

test('hosted App never invokes device SecurityVault or mounts its local PIN settings', () => {
  assert.match(localSecurityPolicy, /return target === 'local'/);
  assert.match(app, /const useLocalSecurityVault = shouldUseLocalSecurityVault\(firebaseTarget\)/);
  assert.match(app, /useLocalSecurityVault && SecurityVault\.isCurrentlyLocked\(\)/);
  assert.match(app, /useLocalSecurityVault && SecurityVault\.isSecurityEnabled\(\)/);
  assert.match(app, /useLocalSecurityVault && \(\s*hasOpenedSecuritySettings && \(\s*<Suspense[\s\S]{0,200}<SecuritySettingsModal/);
  assert.match(app, /useLocalSecurityVault && isAppLocked/);
});

test('outbox UI exposes safe metadata only and keeps restored replay owner-initiated', () => {
  assert.match(topAppBar, /Sinkronkan mutasi tersimpan/);
  assert.match(topAppBar, /Isi prospek dan aktivitas tidak ditampilkan/);
  assert.doesNotMatch(topAppBar, /QueueCorrectionEditor|getFailedMutation|correctFailedOperation|company_name|contact_person|lead_id|activity_type|notes|\.payload/);
  assert.match(app, /manualReplayCount/);
  assert.match(app, /window\.confirm\(/);
  assert.match(app, /startManualReplay\(\)/);
  assert.doesNotMatch(app, /getFailedMutation|correctFailedOperation/);
});
