import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  onIdTokenChanged,
  reauthenticateWithPopup,
  signInWithCustomToken,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  firebaseIsConfigured,
  firebaseTarget,
  getFirebaseAuth,
  getFirebaseStartupErrorMessage,
  getGoogleProvider,
  hasWorkspaceConfiguration,
  isDesignatedOwner,
  verifyFirebaseStartup,
} from '../firebase.ts';
import { activateFirestoreWriteQueue, deactivateFirestoreWriteQueue } from '../firebaseRepository.ts';
import { firestoreWriteQueue } from '../utils/offlineWriteQueue.ts';
import { isOwnerBootstrapEnabled } from '../utils/ownerBootstrap.ts';
import { requiresServerIssuedPinSession } from '../accountPinPolicy.ts';
import { createAccountPinClient, type AccountPinClientStatus } from '../accountPinClient.ts';
import { AccountPinGate } from './AccountPinGate.tsx';

const accountPinClient = createAccountPinClient({
  fetch: (...args) => fetch(...args),
  getAuth: getFirebaseAuth,
  getGoogleProvider,
  reauthenticate: reauthenticateWithPopup,
  signInWithCustomToken,
});

interface FirebaseAuthGateProps {
  children: ReactNode;
}

type AccountPinGateState = 'checking' | 'verified' | 'pin-required' | 'enrollment-available' | 'enrollment-blocked' | 'unavailable';

function nextGateState(status: AccountPinClientStatus): AccountPinGateState {
  if (status.sessionActive) return 'verified';
  if (status.credentialRegistered) return 'pin-required';
  return status.enrollmentEnabled ? 'enrollment-available' : 'enrollment-blocked';
}

export function FirebaseAuthGate({ children }: FirebaseAuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);
  const [accountPinGateState, setAccountPinGateState] = useState<AccountPinGateState>('checking');
  const [accountPinStatus, setAccountPinStatus] = useState<AccountPinClientStatus | undefined>();
  const [sessionExpiresAt, setSessionExpiresAt] = useState<string | undefined>();
  const [sessionRevalidating, setSessionRevalidating] = useState(false);
  const [sessionCheckTrigger, setSessionCheckTrigger] = useState(0);
  const [pinRefreshTrigger, setPinRefreshTrigger] = useState(0);

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
          const eventGeneration = ++generation;
          setReady(false);
          setStartupError(null);
          setAccountPinStatus(undefined);
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
          if (serverPinRequired) {
            setAccountPinGateState('checking');
            deactivateFirestoreWriteQueue();
          }

          void (async () => {
            if (nextUser && isDesignatedOwner(nextUser.uid) && hasWorkspaceConfiguration()) {
              if (serverPinRequired) {
                try {
                  const status = await accountPinClient.fetchStatus(nextUser);
                  if (!active || eventGeneration !== generation) return;
                  setAccountPinStatus(status);
                  if (status.sessionActive) {
                    try {
                      await activateFirestoreWriteQueue(nextUser.uid);
                    } catch {
                      deactivateFirestoreWriteQueue();
                      if (!active || eventGeneration !== generation) return;
                      setUser(nextUser);
                      setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
                      setReady(true);
                      return;
                    }
                    setSessionExpiresAt(status.sessionExpiresAt);
                    setAccountPinGateState('verified');
                  } else {
                    deactivateFirestoreWriteQueue();
                    setAccountPinGateState(nextGateState(status));
                  }
                } catch {
                  deactivateFirestoreWriteQueue();
                  if (!active || eventGeneration !== generation) return;
                  setAccountPinGateState('unavailable');
                }
              } else {
                try {
                  await activateFirestoreWriteQueue(nextUser.uid);
                } catch {
                  deactivateFirestoreWriteQueue();
                  if (!active || eventGeneration !== generation) return;
                  setUser(nextUser);
                  setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
                  setReady(true);
                  return;
                }
              }
            } else {
              deactivateFirestoreWriteQueue();
              if (serverPinRequired) setAccountPinGateState('checking');
            }

            if (!active || eventGeneration !== generation) return;
            setUser(nextUser);
            setError(null);
            setReady(true);
          })();
        }, () => {
          if (!active) return;
          deactivateFirestoreWriteQueue();
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
      deactivateFirestoreWriteQueue();
      try {
        const status = await accountPinClient.fetchStatus(user);
        if (!active) return;
        setAccountPinStatus(status);
        if (!status.sessionActive) {
          setAccountPinGateState(nextGateState(status));
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
          return;
        }
        try {
          await activateFirestoreWriteQueue(user.uid);
        } catch {
          if (!active) return;
          deactivateFirestoreWriteQueue();
          setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
          setSessionExpiresAt(undefined);
          setSessionRevalidating(false);
          return;
        }
        if (!active) {
          deactivateFirestoreWriteQueue();
          return;
        }
        setSessionExpiresAt(status.sessionExpiresAt);
        setSessionRevalidating(false);
        setSessionCheckTrigger((value) => value + 1);
      } catch {
        if (!active) return;
        deactivateFirestoreWriteQueue();
        setAccountPinGateState('unavailable');
        setSessionExpiresAt(undefined);
        setSessionRevalidating(false);
      } finally {
        checking = false;
      }
    };

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
      window.clearTimeout(timer);
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [user, accountPinGateState, sessionExpiresAt, sessionCheckTrigger]);

  const handleSignIn = async () => {
    setError(null);
    try {
      await signInWithPopup(getFirebaseAuth(), getGoogleProvider());
    } catch (cause) {
      const code = (cause as { code?: string })?.code;
      if (code === 'auth/unauthorized-domain') {
        setError('Origin aplikasi belum diizinkan oleh Firebase (auth/unauthorized-domain). Hentikan uji ini; penambahan authorized domain memerlukan persetujuan owner terlebih dahulu.');
      } else if (code !== 'auth/popup-closed-by-user') {
        setError('Google Sign-In gagal atau dibatalkan. Tidak ada data lokal yang dibuka.');
      }
    }
  };

  const handleSignOut = useCallback(async () => {
    const snapshot = firestoreWriteQueue.getSnapshot();
    const unsyncedCount = snapshot.pendingCount + snapshot.syncingCount + snapshot.failedCount;
    if (unsyncedCount > 0) {
      const confirmed = window.confirm(
        `${unsyncedCount} mutasi belum diakui Firestore. Mutasi akan tetap tersimpan di antrean terenkripsi browser ini dan hanya dipulihkan saat owner/workspace yang sama masuk lagi. Lanjutkan logout?`,
      );
      if (!confirmed) return;
    }
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
  if (!ready) return <AuthMessage title="Memverifikasi sesi" detail="Menunggu Firebase Authentication dan, untuk hosted, sesi PIN server…" />;
  if (!user) {
    return (
      <AuthMessage title="Masuk ke AR CRM" detail="Gunakan Google Sign-In. Sampai UID owner dan workspace dikonfigurasi, layar ini tidak membuka data CRM.">
        <button onClick={handleSignIn} className="rounded-[8px] bg-[#ff4800] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#d93d00]">Masuk dengan Google</button>
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
      />
    );
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-[60] flex items-center gap-2 rounded-[8px] border border-[#eae4d5] bg-[#fcfcfa]/95 px-2 py-1 text-[10px] text-[#6b665c] shadow-sm">
        <span className="max-w-[180px] truncate">{user.email || 'Google user'}</span>
        <button onClick={handleSignOut} className="font-bold text-[#ff4800]">Keluar</button>
      </div>
      {children}
    </>
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
