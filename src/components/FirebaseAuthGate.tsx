import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { firebaseIsConfigured, getFirebaseAuth, getFirebaseStartupErrorMessage, getGoogleProvider, hasWorkspaceConfiguration, isDesignatedOwner, verifyFirebaseStartup } from '../firebase.ts';
import { activateFirestoreWriteQueue, deactivateFirestoreWriteQueue } from '../firebaseRepository.ts';
import { firestoreWriteQueue } from '../utils/syncQueue.ts';
import { isOwnerBootstrapEnabled } from '../utils/ownerBootstrap.ts';

interface FirebaseAuthGateProps {
  children: ReactNode;
}

export function FirebaseAuthGate({ children }: FirebaseAuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [startupError, setStartupError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseIsConfigured) {
      setReady(true);
      return;
    }
    let active = true;
    let generation = 0;
    let unsubscribe: (() => void) | undefined;

    const start = async () => {
      try {
        await verifyFirebaseStartup();
        if (!active) return;
        unsubscribe = onAuthStateChanged(getFirebaseAuth(), (nextUser) => {
          const eventGeneration = ++generation;
          setReady(false);
          setStartupError(null);
          void (async () => {
            try {
              if (nextUser && isDesignatedOwner(nextUser.uid) && hasWorkspaceConfiguration()) {
                await activateFirestoreWriteQueue(nextUser.uid);
              } else {
                deactivateFirestoreWriteQueue();
              }
              if (!active || eventGeneration !== generation) return;
              setUser(nextUser);
              setError(null);
              setReady(true);
            } catch {
              deactivateFirestoreWriteQueue();
              if (!active || eventGeneration !== generation) return;
              setUser(nextUser);
              setStartupError('Antrean lokal tertunda tidak dapat dipulihkan dengan aman. Operasi tidak dikirim dan akses CRM ditahan; jangan hapus data situs sebelum antrean diperiksa.');
              setReady(true);
            }
          })();
        }, () => {
          if (!active) return;
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
  }, []);

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

  const handleSignOut = async () => {
    const snapshot = firestoreWriteQueue.getSnapshot();
    const unsyncedCount = snapshot.pendingCount + snapshot.syncingCount + snapshot.failedCount;
    if (unsyncedCount > 0) {
      const confirmed = window.confirm(
        `${unsyncedCount} mutasi belum diakui Firestore. Mutasi akan tetap tersimpan di antrean terenkripsi browser ini dan hanya dipulihkan saat owner/workspace yang sama masuk lagi. Lanjutkan logout?`,
      );
      if (!confirmed) return;
    }
    await signOut(getFirebaseAuth());
  };

  if (!firebaseIsConfigured) {
    return <AuthMessage title="Firebase belum dikonfigurasi" detail="Aplikasi berhenti dengan aman sampai konfigurasi Web App Firebase tersedia. Tidak ada fallback login lokal." />;
  }
  if (startupError) {
    return <AuthMessage title="Firebase belum siap" detail={startupError} />;
  }
  if (!hasWorkspaceConfiguration() && !isOwnerBootstrapEnabled(import.meta.env.DEV, window.location.hostname, window.location.protocol)) {
    return <AuthMessage title="Bootstrap owner tidak tersedia di origin ini" detail="Bootstrap identitas hanya tersedia pada development loopback. Origin lain dan build production tidak menyediakan bootstrap owner. Tidak ada akses CRM atau registrasi workspace." />;
  }
  if (!ready) return <AuthMessage title="Memverifikasi sesi" detail="Menunggu Firebase Authentication…" />;
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
