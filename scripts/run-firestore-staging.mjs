import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const privateEnvPath = path.join(repositoryRoot, '.env.staging.local');
const productionRulesPath = path.join(repositoryRoot, 'firestore.rules');
const stagingRulesPath = path.join(repositoryRoot, 'firestore.staging.rules');
const firebaseCliPath = path.join(repositoryRoot, 'node_modules', '.bin', 'firebase');
const expectedWorkspace = 'ar-crm-staging-owner';

if (!existsSync(privateEnvPath)) throw new Error('Staging emulator test requires the ignored .env.staging.local file.');
if (existsSync(stagingRulesPath)) throw new Error('Private staging Rules file already exists; inspect and remove it before running this generator.');

const privateEnv = dotenv.parse(readFileSync(privateEnvPath));
const projectId = privateEnv.VITE_FIREBASE_PROJECT_ID ?? '';
const ownerUid = privateEnv.VITE_FIREBASE_OWNER_UID ?? '';
const allowedProjects = (privateEnv.VITE_FIREBASE_STAGING_PROJECT_ID_ALLOWLIST ?? '').split(',').map((value) => value.trim());
if (privateEnv.VITE_FIREBASE_TARGET !== 'staging'
  || !/^ar-crm-staging-[a-z0-9][a-z0-9-]{2,}$/.test(projectId)
  || projectId === 'ar-crm-73222'
  || !allowedProjects.includes(projectId)
  || privateEnv.VITE_FIREBASE_WORKSPACE_ID !== expectedWorkspace
  || !/^[A-Za-z0-9_-]{28}$/.test(ownerUid)) {
  throw new Error('Staging target, project allowlist, workspace, or owner binding is invalid.');
}

const productionRules = readFileSync(productionRulesPath, 'utf8');
const ownerMatches = [...productionRules.matchAll(/request\.auth\.uid == '([^']+)'/g)];
const workspaceMatches = [...productionRules.matchAll(/workspaceId == '([^']+)'/g)];
if (ownerMatches.length !== 1 || workspaceMatches.length !== 1) {
  throw new Error('Expected one fixed owner and workspace binding in production Rules.');
}
if (ownerUid === ownerMatches[0][1]) throw new Error('Staging owner must be distinct from the production owner.');
const productionOwnerClause = `request.auth.uid == '${ownerMatches[0][1]}'`;
const productionWorkspaceClause = `workspaceId == '${workspaceMatches[0][1]}'`;
const stagingRules = productionRules
  .replace(productionOwnerClause, `request.auth.uid == '${ownerUid}'`)
  .replace(productionWorkspaceClause, `workspaceId == '${expectedWorkspace}'`);
if (stagingRules === productionRules || stagingRules.includes(productionOwnerClause) || stagingRules.includes(productionWorkspaceClause)) {
  throw new Error('Could not create an isolated staging Rules bundle.');
}

let generated = false;
let exitCode = 1;
try {
  writeFileSync(stagingRulesPath, stagingRules, { mode: 0o600, flag: 'wx' });
  generated = true;
  const childEnv = { ...process.env, FIRESTORE_RULES_TARGET: 'staging' };
  for (const key of ['FIREBASE_TOKEN', 'GOOGLE_APPLICATION_CREDENTIALS', 'GCLOUD_PROJECT', 'GOOGLE_CLOUD_PROJECT']) delete childEnv[key];
  const result = spawnSync(firebaseCliPath, [
    'emulators:exec',
    '--project', 'demo-ar-crm-staging-rules',
    '--config', 'firebase.staging.json',
    '--only', 'firestore',
    'FIRESTORE_RULES_TARGET=staging tsx --test src/firebaseRulesBinding.test.ts firestore.rules.test.ts',
  ], { cwd: repositoryRoot, env: childEnv, stdio: 'inherit' });
  if (result.error) throw result.error;
  exitCode = result.status ?? 1;
} finally {
  if (generated && existsSync(stagingRulesPath)) unlinkSync(stagingRulesPath);
}

process.exitCode = exitCode;
