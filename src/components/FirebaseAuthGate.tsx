import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  GoogleAuthProvider,
  onIdTokenChanged,
  reauthenticateWithCredential,
  signInWithCustomToken,
  signInWithCredential,
  signOut,
  type User,
} from 'firebase/auth';
import {
  firebaseIsConfigured,
  firebaseTarget,
  getFirebaseAuth,
  getFirebaseStartupErrorMessage,
  hasWorkspaceConfiguration,
  isDesignatedOwner,
  verifyFirebaseStartup,
} from '../firebase.ts';
import { activateFirestoreWriteQueue, deactivateFirestoreWriteQueue } from '../firebaseRepository.ts';
import { firestoreWriteQueue } from '../utils/offlineWriteQueue.ts';
import { isOwnerBootstrapEnabled } from '../utils/ownerBootstrap.ts';
import { requiresServerIssuedPinSession } from '../accountPinPolicy.ts';
import { createAccountPinClient, type AccountPinClientStatus } from '../accountPinClient.ts';
import {
  clearPinSessionHint,
  createSerializedQueueLifecycle,
  hasFreshPinSessionHint,
  resolvePinSessionStartupView,
  savePinSessionHint,
  shouldPreserveMountedPinSessionTree,
  validatePinSessionInBackground,
} from '../accountPinSessionUi.ts';
import { AccountPinGate } from './AccountPinGate.tsx';
import { SessionStartupShell } from './SessionStartupShell.tsx';
import { googleIdentityReauthBroker, type GoogleIdentityCredentialResponse } from '../googleIdentityReauthBroker.ts';

const accountPinClient = createAccountPinClient({
  fetch: (...args) => fetch(...args),
  getAuth: getFirebaseAuth,
  getGoogleIdToken: () => googleIdentityReauthBroker.begin().promise,
  reauthenticate: async (user, googleIdToken) => {
    await reauthenticateWithCredential(user, GoogleAuthProvider.credential(googleIdToken));
  },
  signInWithCustomToken,
});

interface GoogleIdentityApi {
  initialize(configuration: {
    client_id: string;
    callback: (response: GoogleIdentityCredentialResponse) => void;
    auto_select: boolean;
    use_fedcm_for_button: boolean;
    nonce?: string;
  }): void;
  renderButton(parent: HTMLElement, options: {
    type: 'standard';
    theme: 'outline';
    size: 'large';
    text: 'signin_with';
    shape: 'rectangular';
    width: number;
  }): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleIdentityApi } };
  }
}

let googleIdentityServicesPromise: Promise<GoogleIdentityApi> | undefined;
let activeGoogleIdentityResponseHandler: ((response: GoogleIdentityCredentialResponse) => void) | undefined;

function dispatchGoogleIdentityResponse(response: GoogleIdentityCredentialResponse): void {
  activeGoogleIdentityResponseHandler?.(response);
}

function loadGoogleIdentityServices(): Promise<GoogleIdentityApi> {
  const existingApi = window.google?.accounts?.id;
  if (existingApi) return Promise.resolve(existingApi);
  if (googleIdentityServicesPromise) return googleIdentityServicesPromise;

  googleIdentityServicesPromise = new Promise<GoogleIdentityApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      const api = window.google?.accounts?.id;
      if (api) resolve(api);
      else reject(new Error('Google Identity Services did not initialize.'));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error('Google Identity Services could not be loaded.'));
    };
    document.head.append(script);
  }).catch((cause: unknown) => {
    googleIdentityServicesPromise = undefined;
    throw cause;
  });

  return googleIdentityServicesPromise;
}

interface FirebaseAuthGateProps {
  children: ReactNode;
}

type AccountPinGateState = 'checking' | 'verified' | 'pin-required' | 'enrollment-available' | 'enrollment-blocked' | 'unavailable';

export function FirebaseAuthGate({ children }: FirebaseAuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signInBusy, setSignInBusy] = useState(false);
  const signInAttemptRef = useRef(false);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [accountPinGateState, setAccountPinGateState] = useState<AccountPinGateState>('checking');
  const [accountPinStatus, setAccountPinStatus] = useState<AccountPinClientStatus | undefined>();
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | undefined>();
  const [sessionRevalidating, setSessionRevalidating] = useState(false);
  const [hasFreshPinHint, setHasFreshPinHint] = useState(false);
  const [sessionCheckTrigger, setSessionCheckTrigger] = useState(0);
  const [pinRefreshTrigger, setPinRefreshTrigger] = useState(0);
  const lastAuthUidRef = useRef<string | undefined>(undefined);
  const verifiedSessionOwnerRef = useRef<string | undefined>(undefined);
  const sessionRevalidateRef = useRef<(() => void) | null>(null);
  const queueLifecycleRef = useRef<ReturnType<typeof createSerializedQueueLifecycle> | null>(null);
  if (!queueLifecycleRef.current) {
    queueLifecycleRef.current = createSerializedQueueLifecycle({
      activate: activateFirestoreWriteQueue,
      deactivate: deactivateFirestoreWriteQueue,
    });
  }
  const queueLifecycle = queueLifecycleRef.current;
  const googleReauthNonce = useSyncExternalStore(googleIdentityReauthBroker.subscribe, googleIdentityReauthBroker.getActiveNonce, () => undefined);
  const googleReauthPending = Boolean(googleReauthNonce);

  useEffect(() => {
    if (!firebaseIsConfigured) {
      setReady(true);
      return;
    }
    let active = true;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;
    const serverPinRequired = requiresServerIssuedPinSession(firebaseTarget);

    const start = async () => {
      try {
        await verifyFirebaseStartup();
        if (!active) return;
        unsubscribe = onIdTokenChanged(getFirebaseAuth(), (nextUser) => {
          const previousUid = lastAuthUidRef.current;
          if (serverPinRequired && nextUser && previousUid === nextUser.uid
            && verifiedSessionOwnerRef.current === nextUser.uid) {
            // Revalidate the same owner without resetting readiness or unmounting the CRM.
            if (sessionRevalidateRef.current) sessionRevalidateRef.current();
            else setSessionCheckTrigger((value) => value + 1);
            return;
          }
          const eventGeneration = ++generation;
          const isCurrent = () => active && eventGeneration === generation;
          if (verifiedSessionOwnerRef.current !== nextUser?.uid) verifiedSessionOwnerRef.current = undefined;
          if (previousUid && previousUid !== nextUser?.uid) clearPinSessionHint(previousUid);
          lastAuthUidRef.current = nextUser?.uid;
          setReady(false);
          setStartupError(null);
          setAccountPinStatus(undefined);
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
          if (serverPinRequired) {
            setAccountPinGateState('checking');
            setHasFreshPinHint(nextUser && isDesignatedOwner(nextUser.uid) && hasWorkspaceConfiguration()
              ? hasFreshPinSessionHint(nextUser.uid)
              : false);
            deactivateFirestoreWriteQueue();
          }
          void (async () => {
            if (nextUser && isDesignatedOwner(nextUser.uid) && hasWorkspaceConfiguration()) {
              if (serverPinRequired) {
                setUser(nextUser);
                setReady(true);
                await queueLifecycle.deactivate();
                if (!isCurrent()) return;
                const result = await validatePinSessionInBackground({
                  user: nextUser,
                  fetchStatus: (owner) => accountPinClient.fetchStatus(owner),
                  activateQueue: queueLifecycle.activate,
                  deactivateQueue: queueLifecycle.deactivate,
                  isCurrent,
                });
                if (!isCurrent() || result.outcome === 'stale') return;
                if ('status' in result) setAccountPinStatus(result.status);
                if (result.outcome === 'verified') {
                  verifiedSessionOwnerRef.current = nextUser.uid;
                  setSessionExpiresAt(result.status.sessionExpiresAt);
                  setHasFreshPinHint(savePinSessionHint(nextUser.uid, result.status.sessionExpiresAt ?? ''));
                  setAccountPinGateState('verified');
                } else if (result.outcome === 'pin-required'
                  || result.outcome === 'enrollment-available'
                  || result.outcome === 'enrollment-blocked') {
                  verifiedSessionOwnerRef.current = undefined;
                  clearPinSessionHint(nextUser.uid);
                  setHasFreshPinHint(false);
                  setSessionExpiresAt(undefined);
                  setAccountPinGateState(result.outcome);
                } else if (result.outcome === 'queue-unavailable') {
                  verifiedSessionOwnerRef.current = undefined;
                  clearPinSessionHint(nextUser.uid);
                  setHasFreshPinHint(false);
                  setSessionExpiresAt(undefined);
                  setAccountPinGateState('unavailable');
                  setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
                  return;
                } else {
                  verifiedSessionOwnerRef.current = undefined;
                  clearPinSessionHint(nextUser.uid);
                  setHasFreshPinHint(false);
                  setSessionExpiresAt(undefined);
                  setAccountPinGateState('unavailable');
                }
              } else {
                try {
                  const activated = await queueLifecycle.activate(nextUser.uid, isCurrent);
                  if (!activated || !isCurrent()) return;
                } catch {
                  await queueLifecycle.deactivate();
                  if (!isCurrent()) return;
                  setUser(nextUser);
                  setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
                  setReady(true);
                  return;
                }
              }
            } else {
              await queueLifecycle.deactivate();
              if (!isCurrent()) return;
              if (serverPinRequired) setAccountPinGateState('checking');
            }

            if (!isCurrent()) return;
            setUser(nextUser);
            setError(null);
            setReady(true);
          })();
        }, () => {
          if (!active) return;
          generation += 1;
          deactivateFirestoreWriteQueue();
          void queueLifecycle.deactivate();
          clearPinSessionHint(lastAuthUidRef.current ?? '');
          lastAuthUidRef.current = undefined;
          verifiedSessionOwnerRef.current = undefined;
          setUser(null);
          setAccountPinStatus(undefined);
          setSessionExpiresAt(undefined);
          setHasFreshPinHint(false);
          if (serverPinRequired) setAccountPinGateState('unavailable');
          setError('Sesi Firebase tidak dapat diverifikasi. Silakan coba lagi.');
          setReady(true);
        });
      } catch {
        if (!active) return;
        deactivateFirestoreWriteQueue();
        setStartupError(getFirebaseStartupErrorMessage() ?? 'Firebase tidak dapat disiapkan dengan aman. Permintaan Auth dan Firestore diblokir.');
        setReady(true);
      }
    };

    void start();
    return () => {
      active = false;
      generation += 1;
      unsubscribe?.();
      deactivateFirestoreWriteQueue();
    };
  }, [pinRefreshTrigger]);

  useEffect(() => {
    if (!requiresServerIssuedPinSession(firebaseTarget) || !user
      || accountPinGateState !== 'verified' || !sessionExpiresAt) return;
    let active = true;
    let checking = false;

    const revalidate = async () => {
      if (checking) return;
      checking = true;
      setSessionRevalidating(true);
      setHasFreshPinHint(hasFreshPinSessionHint(user.uid));
      deactivateFirestoreWriteQueue();
      try {
        await queueLifecycle.deactivate();
        if (!active) return;
        const isCurrent = () => active;
        const result = await validatePinSessionInBackground({
          user,
          fetchStatus: (owner) => accountPinClient.fetchStatus(owner),
          activateQueue: queueLifecycle.activate,
          deactivateQueue: queueLifecycle.deactivate,
          isCurrent,
        });
        if (!active || result.outcome === 'stale') return;
        if ('status' in result) setAccountPinStatus(result.status);
        if (result.outcome === 'verified') {
          verifiedSessionOwnerRef.current = user.uid;
          setHasFreshPinHint(savePinSessionHint(user.uid, result.status.sessionExpiresAt ?? ''));
          setSessionExpiresAt(result.status.sessionExpiresAt);
          setSessionRevalidating(false);
          setSessionCheckTrigger((value) => value + 1);
        } else if (result.outcome === 'pin-required'
          || result.outcome === 'enrollment-available'
          || result.outcome === 'enrollment-blocked') {
          verifiedSessionOwnerRef.current = undefined;
          clearPinSessionHint(user.uid);
          setHasFreshPinHint(false);
          setAccountPinGateState(result.outcome);
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
        } else if (result.outcome === 'queue-unavailable') {
          verifiedSessionOwnerRef.current = undefined;
          clearPinSessionHint(user.uid);
          setHasFreshPinHint(false);
          setAccountPinGateState('unavailable');
          setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
        } else {
          verifiedSessionOwnerRef.current = undefined;
          clearPinSessionHint(user.uid);
          setHasFreshPinHint(false);
          setAccountPinGateState('unavailable');
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
        }
      } catch {
        if (!active) return;
        verifiedSessionOwnerRef.current = undefined;
        clearPinSessionHint(user.uid);
        setHasFreshPinHint(false);
        setAccountPinGateState('unavailable');
        setSessionExpiresAt(undefined);
        setSessionRevalidating(false);
      } finally {
        checking = false;
      }
    };
    const requestRevalidation = () => {
      if (active) void revalidate();
    };
    sessionRevalidateRef.current = requestRevalidation;

    const expiryMs = Date.parse(sessionExpiresAt);
    const timerDelay = Number.isFinite(expiryMs) ? Math.max(0, expiryMs - Date.now()) : 0;
    const timer = window.setTimeout(() => { void revalidate(); }, timerDelay);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void revalidate();
    };
    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      active = false;
      if (sessionRevalidateRef.current === requestRevalidation) sessionRevalidateRef.current = null;
      window.clearTimeout(timer);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, accountPinGateState, sessionExpiresAt, sessionCheckTrigger]);

  const handleGoogleCredential = useCallback(async (googleIdToken: string) => {
    if (signInAttemptRef.current) return;
    signInAttemptRef.current = true;
    setSignInBusy(true);
    setError(null);
    try {
      const firebaseCredential = GoogleAuthProvider.credential(googleIdToken);
      await signInWithCredential(getFirebaseAuth(), firebaseCredential);
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        setError('Origin aplikasi belum diizinkan oleh Firebase (auth/unauthorized-domain). Hentikan uji ini; penambahan authorized domain memerlukan persetujuan owner terlebih dahulu.');
      } else {
        setError('Google Sign-In gagal atau dibatalkan. Tidak ada data lokal yang dibuka.');
      }
    } finally {
      signInAttemptRef.current = false;
      setSignInBusy(false);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    const snapshot = firestoreWriteQueue.getSnapshot();
    const unsyncedCount = snapshot.pendingCount + snapshot.syncingCount + snapshot.failedCount;
    if (unsyncedCount > 0) {
      const confirmed = window.confirm(
        `${unsyncedCount} mutasi belum diakui Firestore. Mutasi akan tetap tersimpan di antrean terenkripsi browser ini dan hanya dipulihkan saat owner/workspace yang sama masuk lagi. Lanjutkan logout?`,
      );
      if (!confirmed) return;
    }
    clearPinSessionHint(lastAuthUidRef.current ?? user?.uid ?? '');
    verifiedSessionOwnerRef.current = undefined;
    setHasFreshPinHint(false);
    await signOut(getFirebaseAuth());
  }, []);

  if (!firebaseIsConfigured) {
    return <AuthMessage title="Firebase belum dikonfigurasi" detail="Aplikasi berhenti dengan aman sampai konfigurasi Web App Firebase tersedia. Tidak ada fallback login lokal." />;
  }
  if (startupError) {
    return <AuthMessage title="Firebase belum siap" detail={startupError} />;
  }
  if (!hasWorkspaceConfiguration() && !isOwnerBootstrapEnabled(import.meta.env.DEV, window.location.hostname, window.location.protocol, firebaseTarget)) {
    return <AuthMessage title="Bootstrap owner tidak tersedia di origin ini" detail="Bootstrap identitas hanya tersedia pada development loopback. Origin lain dan build production tidak menyediakan bootstrap owner. Tidak ada akses CRM atau registrasi workspace." />;
  }
  if (!ready) return <SessionStartupShell mode="auth" />;
  if (!user) {
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID.trim();
    return (
      <AuthMessage title="Masuk ke AR CRM" detail="Gunakan Google Sign-In. Sampai UID owner dan workspace dikonfigurasi, layar ini tidak membuka data CRM.">
        {googleClientId ? (
          <GoogleIdentitySignInButton
            clientId={googleClientId}
            onCredential={handleGoogleCredential}
            onError={setError}
            busy={signInBusy}
          />
        ) : (
          <p role="alert" className="text-xs text-[#9b2c2c]">Google Sign-In belum dikonfigurasi untuk origin ini.</p>
        )}
        {signInBusy && <p role="status" className="text-center text-xs text-[#6b665c]">Memverifikasi sesi Google dengan Firebase…</p>}
        {error && <p role="alert" className="text-xs text-[#9b2c2c]">{error}</p>}
      </AuthMessage>
    );
  }
  if (!hasWorkspaceConfiguration()) {
    return <OwnerBootstrapMessage user={user} onSignOut={handleSignOut} />;
  }
  if (!isDesignatedOwner(user.uid)) {
    return <AuthMessage title="Akses belum diizinkan" detail="Akun Google ini bukan designated owner AR CRM. Administrator harus mengonfigurasi owner UID secara eksplisit; tidak ada first-user-wins atau fallback lokal."><SignOutButton onSignOut={handleSignOut} /></AuthMessage>;
  }
  const pinStartupView = resolvePinSessionStartupView({
    gateState: accountPinGateState,
    sessionRevalidating,
    hasFreshHint: hasFreshPinHint,
  });
  const preserveMountedApp = shouldPreserveMountedPinSessionTree({
    gateState: accountPinGateState,
    sessionRevalidating,
    currentOwnerUid: user.uid,
    verifiedOwnerUid: verifiedSessionOwnerRef.current,
    sessionExpiresAt,
  });
  if (requiresServerIssuedPinSession(firebaseTarget)
    && (pinStartupView === 'warm-shell' || pinStartupView === 'checking-shell')) {
    return (
      <>
        <SessionStartupShell mode="pin" hasFreshPinHint={pinStartupView === 'warm-shell'} />
        {preserveMountedApp && <div className="hidden" hidden aria-hidden="true">{children}</div>}
      </>
    );
  }
  if (requiresServerIssuedPinSession(firebaseTarget)
    && (accountPinGateState !== 'verified' || sessionRevalidating)) {
    return (
      <AccountPinGate
        user={user}
        client={accountPinClient}
        state={sessionRevalidating || accountPinGateState === 'verified' ? 'checking' : accountPinGateState}
        status={accountPinStatus}
        onRetry={() => setPinRefreshTrigger((value) => value + 1)}
        onSignOut={handleSignOut}
        googleReauthControl={accountPinGateState === 'enrollment-available' && googleReauthNonce ? (
          <GoogleIdentityReauthButton key={googleReauthNonce} nonce={googleReauthNonce} clientId={import.meta.env.VITE_GOOGLE_CLIENT_ID.trim()} />
        ) : undefined}
        googleReauthPending={googleReauthPending}
        onCancelGoogleReauth={() => googleIdentityReauthBroker.cancel()}
      />
    );
  }

  return (
    <>
      <div className="flex w-full min-w-0 flex-wrap items-center justify-end gap-x-2 gap-y-1 border-b border-[#eae4d5] bg-[#fcfcfa] px-3 py-1 text-[10px] text-[#6b665c] sm:px-4">
        <span className="min-w-0 max-w-full truncate" title={user.email || 'Google user'}>{user.email || 'Google user'}</span>
        <button onClick={handleSignOut} className="min-h-11 shrink-0 rounded-[8px] px-2 font-bold text-[#ff4800] hover:bg-[#fff0e8]">Keluar</button>
      </div>
      <div className="contents">{children}</div>
    </>
  );
}

function GoogleIdentitySignInButton({
  clientId,
  onCredential,
  onError,
  busy,
}: {
  clientId: string;
  onCredential: (googleIdToken: string) => Promise<void>;
  onError: (message: string) => void;
  busy: boolean;
}) {
  const buttonRootRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  const [buttonReady, setButtonReady] = useState(false);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    let active = true;
    const responseHandler = (response: GoogleIdentityCredentialResponse) => {
      if (typeof response.credential !== 'string' || response.credential.length === 0) {
        onErrorRef.current('Google Sign-In tidak mengembalikan kredensial yang valid.');
        return;
      }
      void onCredentialRef.current(response.credential);
    };
    activeGoogleIdentityResponseHandler = responseHandler;

    void loadGoogleIdentityServices().then((googleIdentity) => {
      const buttonRoot = buttonRootRef.current;
      if (!active || !buttonRoot) return;
      googleIdentity.initialize({ client_id: clientId, callback: dispatchGoogleIdentityResponse, auto_select: false, use_fedcm_for_button: true });
      googleIdentity.renderButton(buttonRoot, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: Math.min(400, Math.max(120, Math.floor(buttonRoot.getBoundingClientRect().width))),
      });
      setButtonReady(true);
    }).catch(() => {
      if (!active) return;
      onErrorRef.current('Google Sign-In tidak dapat dimuat. Periksa koneksi, lalu muat ulang halaman.');
    });

    return () => {
      active = false;
      if (activeGoogleIdentityResponseHandler === responseHandler) activeGoogleIdentityResponseHandler = undefined;
      buttonRootRef.current?.replaceChildren();
    };
  }, [clientId]);

  return (
    <div aria-busy={busy || !buttonReady} className={busy ? 'pointer-events-none opacity-60' : ''}>
      {!buttonReady && <p role="status" className="mb-2 text-center text-sm text-[#6b665c]">Menyiapkan Google Sign-In…</p>}
      <div ref={buttonRootRef} className="w-full" />
    </div>
  );
}

function GoogleIdentityReauthButton({ clientId, nonce }: { clientId: string; nonce: string }) {
  const buttonRootRef = useRef<HTMLDivElement>(null);
  const [buttonReady, setButtonReady] = useState(false);

  useEffect(() => {
    let active = true;
    const responseHandler = (response: GoogleIdentityCredentialResponse) => {
      if (!active) return;
      googleIdentityReauthBroker.handleResponse(response);
    };
    activeGoogleIdentityResponseHandler = responseHandler;

    void loadGoogleIdentityServices().then((googleIdentity) => {
      const buttonRoot = buttonRootRef.current;
      if (!active || !buttonRoot || !clientId) return;
      if (googleIdentityReauthBroker.getActiveNonce() !== nonce) return;
      googleIdentity.initialize({ client_id: clientId, callback: dispatchGoogleIdentityResponse, auto_select: false, use_fedcm_for_button: true, nonce });
      googleIdentity.renderButton(buttonRoot, {
        type: 'standard',
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        shape: 'rectangular',
        width: Math.min(400, Math.max(120, Math.floor(buttonRoot.getBoundingClientRect().width))),
      });
      setButtonReady(true);
    }).catch(() => {
      if (active) googleIdentityReauthBroker.cancel();
    });

    return () => {
      active = false;
      if (activeGoogleIdentityResponseHandler === responseHandler) activeGoogleIdentityResponseHandler = undefined;
      buttonRootRef.current?.replaceChildren();
      if (googleIdentityReauthBroker.getActiveNonce() === nonce) googleIdentityReauthBroker.cancel();
    };
  }, [clientId, nonce]);

  return (
    <div aria-busy={!buttonReady}>
      {!buttonReady && <p role="status" className="text-xs text-[#6b665c]">Menyiapkan verifikasi Google…</p>}
      <div ref={buttonRootRef} className="w-full" />
    </div>
  );
}

function OwnerBootstrapMessage({ user, onSignOut }: { user: User; onSignOut: () => void }) {
  return (
    <AuthMessage
      title="Login uji owner berhasil"
      detail="Layar bootstrap ini hanya menampilkan identitas Firebase Auth. Belum ada data CRM yang dibaca atau ditulis, dan UID tidak diikat otomatis. Catat UID berikut untuk konfigurasi owner secara eksplisit."
    >
      <div className="space-y-1 rounded-[8px] border border-[#eae4d5] bg-[#fcfcfa] p-3 text-sm">
        <p><span className="font-semibold">Akun Google:</span> {user.email || 'Tidak tersedia'}</p>
        <p className="break-all"><span className="font-semibold">Firebase Auth UID:</span> <code className="select-all font-mono">{user.uid}</code></p>
      </div>
      <p className="text-xs leading-5 text-[#6b665c]">Jangan bagikan token, cookie, atau kredensial. UID saja yang diperlukan untuk langkah konfigurasi berikutnya.</p>
      <SignOutButton onSignOut={onSignOut} />
    </AuthMessage>
  );
}

function SignOutButton({ onSignOut }: { onSignOut: () => void }) {
  return <button onClick={onSignOut} className="rounded-[8px] border border-[#eae4d5] px-3 py-2 text-sm font-semibold text-[#6b665c]">Keluar dari sesi uji</button>;
}

function AuthMessage({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fcfcfa] p-6"><section className="w-full max-w-md space-y-4 rounded-[12px] border border-[#eae4d5] bg-white p-6 shadow-sm"><h1 className="text-xl font-bold text-[#1f1f1f]">{title}</h1><p className="text-sm leading-6 text-[#6b665c]">{detail}</p>{children}</section></main>;
}
