import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { FieldValue, getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  isValidMakeWebhookServiceAccountJson,
  MakeWebhookConflictError,
  type MakeLeadPayload,
  type MakeWebhookTarget,
  type MakeWebhookWriter,
} from './makeLeadWebhook.ts';

const ADMIN_APP_NAME = 'ar-crm-make-webhook-staging';

function getAdminApp(target: MakeWebhookTarget, environment: Record<string, string | undefined>): App {
  const existing = getApps().find((app) => app.name === ADMIN_APP_NAME);
  if (existing) {
    if (existing.options.projectId !== target.projectId) {
      throw new Error('Webhook Admin app target mismatch.');
    }
    return existing;
  }

  if (target.kind === 'local-emulator') {
    return initializeApp({ projectId: target.projectId }, ADMIN_APP_NAME);
  }

  const rawServiceAccount = environment.FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON;
  if (!isValidMakeWebhookServiceAccountJson(rawServiceAccount, target.projectId)) {
    throw new Error('Webhook staging service account is not configured for the fixed staging project.');
  }
  const serviceAccount = JSON.parse(rawServiceAccount!) as Record<string, string>;
  return initializeApp({
    credential: cert({
      projectId: target.projectId,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId: target.projectId,
  }, ADMIN_APP_NAME);
}

function matchesLead(actual: Record<string, unknown>, lead: MakeLeadPayload, ownerUid: string): boolean {
  const expected: Record<string, unknown> = { ...lead, ownerId: ownerUid, role: 'owner' };
  const expectedKeys = [...Object.keys(expected), 'created_at', 'updated_at'].sort();
  const actualKeys = Object.keys(actual).sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index])
    && Object.entries(expected).every(([key, value]) => Object.is(actual[key], value))
    && typeof (actual.created_at as { toDate?: unknown } | undefined)?.toDate === 'function'
    && typeof (actual.updated_at as { toDate?: unknown } | undefined)?.toDate === 'function';
}

export class MakeLeadWebhookFirestoreWriter implements MakeWebhookWriter {
  constructor(private readonly firestore: Firestore) {}

  async createLead(documentId: string, lead: MakeLeadPayload, target: MakeWebhookTarget): Promise<'created' | 'duplicate'> {
    const workspaceRef = this.firestore.doc(`workspaces/${target.workspaceId}`);
    const membershipRef = this.firestore.doc(`workspaces/${target.workspaceId}/members/${target.ownerUid}`);
    const leadRef = this.firestore.doc(`workspaces/${target.workspaceId}/leads/${documentId}`);
    const expected = { ...lead, ownerId: target.ownerUid, role: 'owner' };

    return this.firestore.runTransaction(async (transaction) => {
      const [workspaceSnapshot, membershipSnapshot, leadSnapshot] = await Promise.all([
        transaction.get(workspaceRef),
        transaction.get(membershipRef),
        transaction.get(leadRef),
      ]);
      if (!workspaceSnapshot.exists || workspaceSnapshot.get('ownerId') !== target.ownerUid
        || !membershipSnapshot.exists || membershipSnapshot.get('role') !== 'owner') {
        throw new Error('Webhook workspace binding is not provisioned for the configured staging owner.');
      }
      if (leadSnapshot.exists) {
        if (matchesLead(leadSnapshot.data() ?? {}, lead, target.ownerUid)) return 'duplicate';
        throw new MakeWebhookConflictError();
      }
      transaction.create(leadRef, {
        ...expected,
        created_at: FieldValue.serverTimestamp(),
        updated_at: FieldValue.serverTimestamp(),
      });
      return 'created';
    });
  }
}

export function createMakeLeadWebhookWriter(
  target: MakeWebhookTarget,
  environment: Record<string, string | undefined> = process.env,
): MakeLeadWebhookWriterFirestore {
  if (target.kind === 'local-emulator'
    && environment.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8080'
    && environment.FIRESTORE_EMULATOR_HOST !== 'localhost:8080'
    && environment.FIRESTORE_EMULATOR_HOST !== '[::1]:8080') {
    throw new Error('Local Make webhook writes require the loopback Firestore Emulator.');
  }
  const app = getAdminApp(target, environment);
  return new MakeLeadWebhookFirestoreWriter(getFirestore(app));
}

type MakeLeadWebhookWriterFirestore = MakeWebhookWriter;
