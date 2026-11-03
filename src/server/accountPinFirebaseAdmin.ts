import { getVercelOidcToken } from '@vercel/oidc';
import { ExternalAccountClient, GoogleAuth, type AuthClient, type IdentityPoolClientOptions } from 'google-auth-library';
import { applicationDefault, cert, getApps, initializeApp, type App, type AppOptions, type Credential } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { FirestoreAccountPinStore } from './accountPinFirestoreStore.ts';
import { isAccountPinEnrollmentFlagEnabled } from './accountPinEnrollmentPolicy.ts';
import { FIREBASE_RULES_WORKSPACE_ID, firebaseOwnerBindingMatchesRules } from '../firebaseRulesBinding.ts';
import { reserveAiUsage } from './leadFinderQuota.ts';
import {
  logAccountPinDiagnostic,
  logAccountPinRequestDiagnostic,
  markAccountPinDiagnostic,
  type AccountPinDiagnosticStage,
} from './accountPinDiagnostics.ts';
import {
  createAccountPinEnrollmentService,
  createAccountPinStatusService,
  createAccountPinVerificationService,
  createAccountPinVerifier,
  FirebaseIdTokenValidationError,
  verifyAccountPinVerifier,
  type PinVerificationDependencies,
  type PinVerificationRequest,
  type PinVerificationResponse,
  type VerifiedFirebaseIdentity,
} from './accountPinVerification.ts';

export const ACCOUNT_PIN_STAGING_PROJECT_ID = 'ar-crm-staging-angga-20261027';
export const ACCOUNT_PIN_PRODUCTION_PROJECT_ID = 'ar-crm-73222';
export const ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID = 'ar-crm-production-pin@ar-crm-73222.iam.gserviceaccount.com';
export const ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER = '577829773376';
export const ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID = 'vercel-prod';
export const ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID = 'vercel-prod';
export const ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE = 'https://iam.googleapis.com/projects/577829773376/locations/global/workloadIdentityPools/vercel-prod/providers/vercel-prod';
const STAGING_ADMIN_APP_NAME = 'ar-crm-account-pin-staging';
const PRODUCTION_ADMIN_APP_NAME = 'ar-crm-account-pin-production-wif';
export const ACCOUNT_PIN_APPROVED_RELEASE_BRANCH = 'cue/firebase-stabilization';
export const ACCOUNT_PIN_APPROVED_PRODUCTION_BRANCHES = [
  ACCOUNT_PIN_APPROVED_RELEASE_BRANCH,
  'main',
] as const;
export const ACCOUNT_PIN_APPROVED_STAGING_BRANCHES = [
  'cue/firebase-stabilization',
  'cue/ar-crm-operational-features',
] as const;

export function isAccountPinApprovedProductionBranch(branch: string | undefined): boolean {
  return ACCOUNT_PIN_APPROVED_PRODUCTION_BRANCHES.some((approvedBranch) => approvedBranch === branch);
}

export function isAccountPinApprovedStagingBranch(branch: string | undefined): boolean {
  return ACCOUNT_PIN_APPROVED_STAGING_BRANCHES.some((approvedBranch) => approvedBranch === branch);
}

export interface AccountPinRuntime {
  verify(request: PinVerificationRequest): Promise<PinVerificationResponse>;
  enroll(request: PinVerificationRequest): Promise<PinVerificationResponse>;
  status(request: PinVerificationRequest): Promise<PinVerificationResponse>;
  reserveAiUsage(limit?: number): Promise<boolean>;
  enrollmentEnabled: boolean;
}

type Environment = Record<string, string | undefined>;

interface ProductionWifConfig {
  projectId: typeof ACCOUNT_PIN_PRODUCTION_PROJECT_ID;
  serviceAccountId: typeof ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID;
  audience: string;
}

interface ExternalAccountTokenClient {
  getAccessToken(): Promise<{ token?: string | null }>;
  credentials: { expiry_date?: number | null };
}

type OidcTokenGetter = () => Promise<string>;
type ExternalAccountClientFactory = (options: IdentityPoolClientOptions) => ExternalAccountTokenClient | null;

interface ProductionCredentialDependencies {
  getVercelOidcToken?: OidcTokenGetter;
  createExternalAccountClient?: ExternalAccountClientFactory;
  now?: () => number;
}

interface ProductionAdminDependencies {
  getApps?: () => App[];
  initializeApp?: (options: AppOptions, name?: string) => App;
  createCredential?: (environment: Environment) => Credential;
  getAuth?: typeof getAuth;
  getFirestore?: typeof getFirestore;
}

const keylessWifCredentials = new WeakSet<object>();
const keylessWifAuthClients = new WeakMap<object, AuthClient>();

function required(environment: Environment, name: string): string {
  const value = environment[name]?.trim();
  if (!value) throw new Error('Account PIN server configuration is incomplete.');
  return value;
}

/** Resolves the Production owner only when all server-side Firebase bindings match the approved identity. */
export function resolveProductionAccountPinOwnerUid(environment: Environment = process.env): string {
  const configuredOwnerUid = environment.VITE_FIREBASE_OWNER_UID?.trim();
  const pinOwnerUid = environment.ACCOUNT_PIN_OWNER_UID === undefined
    ? configuredOwnerUid
    : environment.ACCOUNT_PIN_OWNER_UID.trim();
  const projectId = environment.VITE_FIREBASE_PROJECT_ID?.trim();
  const workspaceId = environment.VITE_FIREBASE_WORKSPACE_ID?.trim();

  if (!configuredOwnerUid || !pinOwnerUid
    || environment.VITE_FIREBASE_TARGET !== 'production'
    || projectId !== ACCOUNT_PIN_PRODUCTION_PROJECT_ID
    || workspaceId !== FIREBASE_RULES_WORKSPACE_ID
    || pinOwnerUid !== configuredOwnerUid
    || !firebaseOwnerBindingMatchesRules(pinOwnerUid, workspaceId)) {
    throw new Error('Account PIN server configuration is incomplete.');
  }
  return pinOwnerUid;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getProductionWifConfig(environment: Environment): ProductionWifConfig {
  if (environment.VERCEL_ENV !== 'production' || environment.ACCOUNT_PIN_ENABLED !== 'true') {
    throw new Error('Account PIN Production runtime is disabled outside the explicitly enabled Production environment.');
  }
  if (!isAccountPinApprovedProductionBranch(environment.VERCEL_GIT_COMMIT_REF)
    || environment.VITE_FIREBASE_TARGET !== 'production') {
    throw new Error('Account PIN Production runtime is restricted to the approved release branch and Firebase target.');
  }

  const projectId = required(environment, 'FIREBASE_ADMIN_PROJECT_ID');
  if (projectId !== ACCOUNT_PIN_PRODUCTION_PROJECT_ID) {
    throw new Error('Account PIN Production runtime is restricted to the approved Firebase project.');
  }

  const serviceAccountId = required(environment, 'FIREBASE_ADMIN_SERVICE_ACCOUNT_ID');
  if (serviceAccountId !== ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID) {
    throw new Error('Account PIN Production runtime is restricted to the approved service account.');
  }

  if (required(environment, 'GCP_PROJECT_NUMBER') !== ACCOUNT_PIN_PRODUCTION_GCP_PROJECT_NUMBER
    || required(environment, 'GCP_WORKLOAD_IDENTITY_POOL_ID') !== ACCOUNT_PIN_PRODUCTION_WIF_POOL_ID
    || required(environment, 'GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID') !== ACCOUNT_PIN_PRODUCTION_WIF_PROVIDER_ID) {
    throw new Error('Account PIN Production runtime is restricted to the approved Workload Identity Federation provider.');
  }

  return {
    projectId: ACCOUNT_PIN_PRODUCTION_PROJECT_ID,
    serviceAccountId: ACCOUNT_PIN_PRODUCTION_SERVICE_ACCOUNT_ID,
    audience: ACCOUNT_PIN_PRODUCTION_WIF_AUDIENCE,
  };
}

function createDefaultExternalAccountClient(options: IdentityPoolClientOptions): ExternalAccountTokenClient | null {
  return ExternalAccountClient.fromJSON(options);
}

/** Creates a keyless Firebase Admin credential from Vercel OIDC and Google Workload Identity Federation. */
export function createProductionAccountPinCredential(
  environment: Environment = process.env,
  dependencies: ProductionCredentialDependencies = {},
): Credential {
  const config = getProductionWifConfig(environment);
  const getOidcToken = dependencies.getVercelOidcToken ?? getVercelOidcToken;
  const createExternalAccountClient = dependencies.createExternalAccountClient ?? createDefaultExternalAccountClient;
  const now = dependencies.now ?? Date.now;

  const externalAccountOptions: IdentityPoolClientOptions = {
    type: 'external_account',
    audience: config.audience,
    subject_token_type: 'urn:ietf:params:oauth:token-type:jwt',
    token_url: 'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url: `https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${config.serviceAccountId}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async (context) => {
        if (context.audience !== config.audience) {
          throw new Error('Vercel OIDC audience does not match the approved Google identity provider.');
        }
        // The approved provider allows Vercel's default team audience. The STS
        // audience above identifies the provider; it must not override the OIDC aud.
        const subjectToken = await getOidcToken();
        if (typeof subjectToken !== 'string' || subjectToken.trim().length === 0) {
          throw new Error('Vercel OIDC did not return a valid subject token.');
        }
        return subjectToken;
      },
    },
  };

  const externalAccountClient = createExternalAccountClient(externalAccountOptions);
  if (!externalAccountClient) throw new Error('Unable to initialize the approved Google external account client.');

  // Firebase Admin's Firestore adapter accepts only its built-in certificate or
  // Application Default credential classes. Reuse the official ADC prototype,
  // while replacing token acquisition with the keyless WIF client.
  const credential = Object.create(Object.getPrototypeOf(applicationDefault())) as Credential;
  Object.defineProperty(credential, 'getAccessToken', {
    enumerable: true,
    value: async () => {
      try {
        const tokenResponse = await externalAccountClient.getAccessToken();
        const expiryDate = externalAccountClient.credentials.expiry_date;
        const expiresIn = typeof expiryDate === 'number' && Number.isFinite(expiryDate)
          ? Math.floor((expiryDate - now()) / 1_000)
          : 0;
        if (typeof tokenResponse.token !== 'string' || tokenResponse.token.trim().length === 0
          || expiresIn < 1) {
          const error = new Error('Google Workload Identity Federation returned an invalid access token.');
          markAccountPinDiagnostic(error, 'wif_token_exchange', 'invalid_access_token');
          throw error;
        }
        return {
          access_token: tokenResponse.token,
          expires_in: expiresIn,
        };
      } catch (error) {
        markAccountPinDiagnostic(error, 'wif_token_exchange');
        throw error;
      }
    },
  });
  keylessWifCredentials.add(credential as object);
  keylessWifAuthClients.set(credential as object, externalAccountClient as unknown as AuthClient);
  return credential;
}

/** Initializes Firebase Admin only for the approved Production project and the keyless WIF credential. */
export function createProductionFirebaseAdminApp(
  environment: Environment = process.env,
  dependencies: ProductionAdminDependencies = {},
): App {
  const config = getProductionWifConfig(environment);
  const getAdminApps = dependencies.getApps ?? getApps;
  const existing = getAdminApps().find((app) => app.name === PRODUCTION_ADMIN_APP_NAME);
  if (existing) {
    if (existing.options.projectId !== config.projectId
      || existing.options.serviceAccountId !== config.serviceAccountId
      || !existing.options.credential
      || !keylessWifCredentials.has(existing.options.credential as object)) {
      const error = new Error('Account PIN Firebase Admin app is not bound to the approved keyless Production configuration.');
      markAccountPinDiagnostic(error, 'firebase_admin_app', undefined,
        existing.options.projectId !== config.projectId ? 'project_mismatch' : undefined);
      throw error;
    }
    return existing;
  }

  let credential: Credential;
  try {
    credential = dependencies.createCredential
      ? dependencies.createCredential(environment)
      : createProductionAccountPinCredential(environment);
  } catch (error) {
    markAccountPinDiagnostic(error, 'wif_credential_build');
    throw error;
  }
  if (!keylessWifCredentials.has(credential as object)) {
    throw new Error('Account PIN Production runtime requires the approved keyless WIF credential.');
  }

  const initializeAdminApp = dependencies.initializeApp ?? initializeApp;
  try {
    return initializeAdminApp({
      credential,
      projectId: config.projectId,
      serviceAccountId: config.serviceAccountId,
    }, PRODUCTION_ADMIN_APP_NAME);
  } catch (error) {
    markAccountPinDiagnostic(error, 'admin_app_initialize');
    throw error;
  }
}

function getStagingAdminApp(environment: Environment) {
  const configuredProjectId = required(environment, 'FIREBASE_ADMIN_PROJECT_ID');
  if (configuredProjectId !== ACCOUNT_PIN_STAGING_PROJECT_ID) {
    throw new Error('Account PIN endpoint is restricted to the staging Firebase project.');
  }

  let serviceAccount: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(required(environment, 'FIREBASE_ADMIN_SERVICE_ACCOUNT_JSON'));
    if (!isObject(parsed)) throw new Error('Invalid service account.');
    serviceAccount = parsed;
  } catch {
    throw new Error('Account PIN server configuration is incomplete.');
  }
  if (serviceAccount.project_id !== ACCOUNT_PIN_STAGING_PROJECT_ID
    || typeof serviceAccount.client_email !== 'string'
    || typeof serviceAccount.private_key !== 'string') {
    throw new Error('Account PIN server configuration is incomplete.');
  }

  const existing = getApps().find((app) => app.name === STAGING_ADMIN_APP_NAME);
  if (existing) {
    if (existing.options.projectId !== ACCOUNT_PIN_STAGING_PROJECT_ID) {
      throw new Error('Account PIN Firebase Admin app is bound to the wrong project.');
    }
    return existing;
  }

  return initializeApp({
    credential: cert({
      projectId: ACCOUNT_PIN_STAGING_PROJECT_ID,
      clientEmail: serviceAccount.client_email,
      privateKey: serviceAccount.private_key,
    }),
    projectId: ACCOUNT_PIN_STAGING_PROJECT_ID,
  }, STAGING_ADMIN_APP_NAME);
}

export function validateFirebaseIdTokenClaims(
  decoded: { aud: unknown; iss: unknown; auth_time: unknown; uid: string; pinSessionId?: unknown },
  projectId: string,
): VerifiedFirebaseIdentity {
  if (decoded.aud !== projectId) {
    const error = new FirebaseIdTokenValidationError('auth_token_claims_invalid');
    markAccountPinDiagnostic(error, 'auth_token_verify', undefined, 'audience_mismatch');
    throw error;
  }
  if (decoded.iss !== `https://securetoken.google.com/${projectId}`) {
    const error = new FirebaseIdTokenValidationError('auth_token_claims_invalid');
    markAccountPinDiagnostic(error, 'auth_token_verify', undefined, 'issuer_mismatch');
    throw error;
  }
  if (typeof decoded.auth_time !== 'number' || !Number.isInteger(decoded.auth_time)) {
    throw new FirebaseIdTokenValidationError('auth_token_auth_time_invalid');
  }
  return {
    uid: decoded.uid,
    authTimeSeconds: decoded.auth_time,
    ...(typeof decoded.pinSessionId === 'string' ? { pinSessionId: decoded.pinSessionId } : {}),
  };
}

function createAccountPinRuntime(
  environment: Environment,
  projectId: string,
  ownerUid: string,
  pepper: string,
  app: App,
  onDiagnostic?: (stage: AccountPinDiagnosticStage, error: unknown) => void,
  onRequestDiagnostic?: PinVerificationDependencies['onRequestDiagnostic'],
  adminDependencies: ProductionAdminDependencies = {},
): AccountPinRuntime {
  if (app.options.projectId !== projectId) {
    const error = new Error('Account PIN Firebase Admin app is bound to the wrong project.');
    markAccountPinDiagnostic(error, 'firebase_admin_app', undefined, 'project_mismatch');
    throw error;
  }
  let auth: ReturnType<typeof getAuth>;
  let firestore: ReturnType<typeof getFirestore>;
  try {
    auth = (adminDependencies.getAuth ?? getAuth)(app);
  } catch (error) {
    markAccountPinDiagnostic(error, 'auth_client_get');
    throw error;
  }
  try {
    firestore = (adminDependencies.getFirestore ?? getFirestore)(app);
    const wifAuthClient = keylessWifAuthClients.get(app.options.credential as object);
    if (wifAuthClient) {
      // Firestore's GAPIC transport uses google-auth-library independently of
      // FirebaseApp.INTERNAL, so explicitly hand it the same WIF auth client.
      firestore.settings({ auth: new GoogleAuth({ authClient: wifAuthClient }) } as never);
    }
  } catch (error) {
    markAccountPinDiagnostic(error, 'firestore_client_get');
    throw error;
  }
  const store = new FirestoreAccountPinStore(firestore);
  const dependencies: PinVerificationDependencies = {
    ownerUid,
    async verifyFirebaseIdToken(idToken) {
      try {
        // Keep revocation checking enabled; the catch only annotates the same
        // error later emitted once by the existing request diagnostic hook.
        const decoded = await auth.verifyIdToken(idToken, true);
        return validateFirebaseIdTokenClaims(decoded, projectId);
      } catch (error) {
        markAccountPinDiagnostic(error, 'auth_token_verify');
        throw error;
      }
    },
    credentials: store,
    verifyAccountPin: (pin, verifier) => verifyAccountPinVerifier(pin, verifier, pepper),
    createAccountPinVerifier: (pin) => createAccountPinVerifier(pin, pepper),
    rateLimiter: store,
    sessions: store,
    createCustomToken: (uid, claims) => auth.createCustomToken(uid, claims),
    ...(onDiagnostic ? { onDiagnostic } : {}),
    ...(onRequestDiagnostic ? { onRequestDiagnostic } : {}),
  };

  const enrollmentEnabled = isAccountPinEnrollmentFlagEnabled(environment);
  return {
    verify: createAccountPinVerificationService(dependencies),
    enroll: createAccountPinEnrollmentService(dependencies),
    status: createAccountPinStatusService(dependencies, enrollmentEnabled),
    reserveAiUsage: (limit = 5) => reserveAiUsage(firestore, ownerUid, limit),
    enrollmentEnabled,
  };
}

export function createStagingAccountPinRuntime(environment: Environment = process.env): AccountPinRuntime {
  if (environment.VERCEL_ENV !== 'preview'
    || !isAccountPinApprovedStagingBranch(environment.VERCEL_GIT_COMMIT_REF)
    || environment.VITE_FIREBASE_TARGET !== 'staging'
    || environment.ACCOUNT_PIN_ENABLED !== 'true') {
    throw new Error('Account PIN endpoint is disabled outside the approved staging Preview.');
  }

  const ownerUid = required(environment, 'ACCOUNT_PIN_OWNER_UID');
  const pepper = required(environment, 'ACCOUNT_PIN_PEPPER');
  if (Buffer.byteLength(pepper, 'utf8') < 32) throw new Error('Account PIN server configuration is incomplete.');
  const projectId = required(environment, 'FIREBASE_ADMIN_PROJECT_ID');
  if (projectId !== ACCOUNT_PIN_STAGING_PROJECT_ID) {
    throw new Error('Account PIN endpoint is restricted to the staging Firebase project.');
  }

  const app = getStagingAdminApp(environment);
  return createAccountPinRuntime(environment, projectId, ownerUid, pepper, app);
}

/** This runtime is prepared for a later gated rollout; current API handlers intentionally remain Preview-only. */
export function createProductionAccountPinRuntime(
  environment: Environment = process.env,
  dependencies: ProductionAdminDependencies = {},
): AccountPinRuntime {
  let config: ProductionWifConfig;
  try {
    config = getProductionWifConfig(environment);
  } catch (error) {
    markAccountPinDiagnostic(error, 'production_runtime_configuration');
    throw error;
  }
  let ownerUid: string;
  try {
    ownerUid = resolveProductionAccountPinOwnerUid(environment);
  } catch (error) {
    markAccountPinDiagnostic(error, 'owner_binding_configuration');
    throw error;
  }
  let pepper: string;
  try {
    pepper = required(environment, 'ACCOUNT_PIN_PEPPER');
    if (Buffer.byteLength(pepper, 'utf8') < 32) throw new Error('Account PIN server configuration is incomplete.');
  } catch (error) {
    markAccountPinDiagnostic(error, 'production_runtime_configuration');
    throw error;
  }

  let app: App;
  try {
    app = createProductionFirebaseAdminApp(environment, dependencies);
  } catch (error) {
    markAccountPinDiagnostic(error, 'firebase_admin_app');
    throw error;
  }
  try {
    return createAccountPinRuntime(
      environment,
      config.projectId,
      ownerUid,
      pepper,
      app,
      (stage, error) => logAccountPinDiagnostic(error, stage),
      (tag, error) => logAccountPinRequestDiagnostic(tag, error),
      dependencies,
    );
  } catch (error) {
    markAccountPinDiagnostic(error, 'firebase_admin_app');
    throw error;
  }
}
