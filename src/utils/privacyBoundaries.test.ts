import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const modal = readFileSync(new URL('../components/ActivityLoggerModal.tsx', import.meta.url), 'utf8');
const server = readFileSync(new URL('../../server.ts', import.meta.url), 'utf8');
const repository = readFileSync(new URL('../firebaseRepository.ts', import.meta.url), 'utf8');
const authGate = readFileSync(new URL('../components/FirebaseAuthGate.tsx', import.meta.url), 'utf8');

 test('activity logger has no notes or lead-PII AI path and captures no GPS', () => {
  assert.doesNotMatch(modal, /fetch\s*\(/);
  assert.doesNotMatch(modal, /summarize-notes|rawNotes|contactPerson|companyName|aiSharingConsent|locationGps|geolocation/);
  assert.match(modal, /GPS capture and AI note summarization are disabled/);
});

test('server notes summarizer is disabled before request-body processing or model access', () => {
  assert.match(server, /app\.post\('\/api\/ai\/summarize-notes', \(_req, res\) => \{\s*res\.status\(403\)/);
  assert.doesNotMatch(server, /generateStructuredMeetingSummary|rawNotes|contactPerson|companyName|generateContent/);
});

test('activity repository writes an explicit notes-only whitelist', () => {
  assert.match(repository, /lead_id: activity\.lead_id/);
  assert.match(repository, /activity_type: activity\.activity_type/);
  assert.match(repository, /notes: activity\.notes/);
  assert.doesNotMatch(repository, /location_gps|latitude|longitude|coords/);
});

test('owner bootstrap exposes UID/email only and keeps unconfigured CRM children closed', () => {
  assert.match(authGate, /isOwnerBootstrapEnabled\(import\.meta\.env\.DEV, window\.location\.hostname, window\.location\.protocol\)/);
  assert.match(authGate, /if \(!hasWorkspaceConfiguration\(\) && !isOwnerBootstrapEnabled/);
  assert.match(authGate, /if \(!hasWorkspaceConfiguration\(\)\) \{\s*return <OwnerBootstrapMessage user=\{user\} onSignOut=\{handleSignOut\} \/>/);
  assert.ok(authGate.indexOf('return <OwnerBootstrapMessage') < authGate.indexOf('{children}'));
  assert.match(authGate, /Firebase Auth UID/);
  assert.match(authGate, /user\.uid/);
  assert.doesNotMatch(authGate, /getIdToken|accessToken|refreshToken|credentialFromResult|localStorage|setDoc|addDoc|onSnapshot/);
});
