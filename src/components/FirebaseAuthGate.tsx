import { useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { firebaseIsConfigured, getFirebaseAuth, getGoogleProvider, hasWorkspaceConfiguration, isDesignatedOwner } from '../firebase.ts';
import { isOwnerBootstrapEnabled } from '../utils/ownerBootstrap.ts';

interface FirebaseAuthGateProps {
  children: ReactNode;
}

export function FirebaseAuthGate({ children }: FirebaseAuthGateProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseIsConfigured) {
      setReady(true);
      return;
    }
    const auth = getFirebaseAuth();
    return onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setReady(true);
      setError(null);
    }, () => {
      setError('Sesi Firebase tidak dapat diverifikasi. Silakan coba lagi.');
      setReady(true);
    });
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

  if (!firebaseIsConfigured) {
    return <AuthMessage title="Firebase belum dikonfigurasi" detail="Aplikasi berhenti dengan aman sampai konfigurasi Web App Firebase tersedia. Tidak ada fallback login lokal." />;
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
    return <OwnerBootstrapMessage user={user} />;
  }
  if (!isDesignatedOwner(user.uid)) {
    return <AuthMessage title="Akses belum diizinkan" detail="Akun Google ini bukan designated owner AR CRM. Administrator harus mengonfigurasi owner UID secara eksplisit; tidak ada first-user-wins atau fallback lokal."><SignOutButton /></AuthMessage>;
  }

  return (
    <>
      <div className="fixed right-3 top-3 z-[60] flex items-center gap-2 rounded-[8px] border border-[#eae4d5] bg-[#fcfcfa]/95 px-2 py-1 text-[10px] text-[#6b665c] shadow-sm">
        <span className="max-w-[180px] truncate">{user.email || 'Google user'}</span>
        <button onClick={() => signOut(getFirebaseAuth())} className="font-bold text-[#ff4800]">Keluar</button>
      </div>
      {children}
    </>
  );
}

function OwnerBootstrapMessage({ user }: { user: User }) {
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
      <SignOutButton />
    </AuthMessage>
  );
}

function SignOutButton() {
  return <button onClick={() => signOut(getFirebaseAuth())} className="rounded-[8px] border border-[#eae4d5] px-3 py-2 text-sm font-semibold text-[#6b665c]">Keluar dari sesi uji</button>;
}

function AuthMessage({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return <main className="flex min-h-screen items-center justify-center bg-[#fcfcfa] p-6"><section className="w-full max-w-md space-y-4 rounded-[12px] border border-[#eae4d5] bg-white p-6 shadow-sm"><h1 className="text-xl font-bold text-[#1f1f1f]">{title}</h1><p className="text-sm leading-6 text-[#6b665c]">{detail}</p>{children}</section></main>;
}
