import { useState, type FormEvent } from 'react';
import type { User } from 'firebase/auth';
import {
  AccountPinClientError,
  type AccountPinClient,
  type AccountPinClientStatus,
} from '../accountPinClient.ts';

type AccountPinGateState = 'checking' | 'pin-required' | 'enrollment-available' | 'enrollment-blocked' | 'unavailable';

interface AccountPinGateProps {
  user: User;
  client: AccountPinClient;
  state: AccountPinGateState;
  status?: AccountPinClientStatus;
  reauthenticationRedirect: boolean;
  onRetry: () => void;
  onSignOut: () => void;
}

function localizedError(error: unknown, operation: 'verify' | 'enroll'): string {
  if (!(error instanceof AccountPinClientError)) {
    return operation === 'enroll'
      ? 'Google re-authentication atau pendaftaran PIN gagal. CRM tetap terkunci; coba lagi atau keluar.'
      : 'PIN akun tidak dapat diverifikasi saat ini. CRM tetap terkunci; coba lagi atau keluar.';
  }
  switch (error.code) {
    case 'invalid_pin':
      return 'PIN akun tidak cocok. PIN ini berbeda dari kunci layar lokal perangkat.';
    case 'rate_limited':
      return 'Terlalu banyak percobaan. Tunggu sebelum mencoba lagi.';
    case 'pin_not_enrolled':
      return 'PIN akun belum terdaftar. Pendaftaran pertama belum diaktifkan dengan aman di lingkungan ini.';
    case 'pin_already_enrolled':
      return 'PIN akun sudah terdaftar. Gunakan PIN akun yang sudah dibuat; reset mandiri tidak tersedia.';
    case 'reauthentication_required':
      return 'Google perlu diverifikasi ulang sekarang. Ulangi pendaftaran dan selesaikan re-authentication.';
    case 'pin_confirmation_mismatch':
      return 'Konfirmasi PIN tidak cocok. Coba lagi.';
    case 'invalid_pin_policy':
      return 'PIN akun harus terdiri dari 6–12 angka.';
    case 'not_found':
    case 'http_404':
    case 'http_503':
    case 'service_unavailable':
      return 'Backend PIN akun belum aktif atau tidak tersedia. Akses cloud tetap ditahan; jangan gunakan PIN lokal sebagai pengganti.';
    default:
      return operation === 'enroll'
        ? 'Pendaftaran PIN akun gagal. Tidak ada akses CRM yang dibuka.'
        : 'Verifikasi PIN akun gagal. Tidak ada akses CRM yang dibuka.';
  }
}

export function AccountPinGate({ user, client, state, status, reauthenticationRedirect, onRetry, onSignOut }: AccountPinGateProps) {
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isEnrollment = state === 'enrollment-available';

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy || (state !== 'pin-required' && !isEnrollment)) return;
    const submittedPin = pin;
    const submittedConfirmation = confirmPin;
    setPin('');
    setConfirmPin('');
    setError(null);
    setBusy(true);
    try {
      if (isEnrollment) {
        await client.enrollAndExchange(user, submittedPin, submittedConfirmation);
      } else {
        await client.verifyAndExchange(user, submittedPin);
      }
    } catch (cause) {
      setError(localizedError(cause, isEnrollment ? 'enroll' : 'verify'));
      if (cause instanceof AccountPinClientError
        && ['pin_not_enrolled', 'pin_already_enrolled', 'not_found', 'service_unavailable'].includes(cause.code)) {
        onRetry();
      }
    } finally {
      setBusy(false);
    }
  };

  let title = 'Akses CRM cloud ditahan';
  let detail = 'Memeriksa credential PIN dan sesi server…';
  if (state === 'pin-required') {
    title = 'Verifikasi PIN akun';
    detail = 'Masukkan PIN akun 6–12 angka untuk membuka sesi cloud. PIN hanya dikirim ke server melalui HTTPS dan tidak disimpan aplikasi di browser.';
  } else if (state === 'enrollment-available') {
    title = 'Daftarkan PIN akun pertama';
    detail = reauthenticationRedirect
      ? 'Pendaftaran hanya tersedia jika server mengonfirmasi belum ada credential. Anda akan diarahkan ke Google pada tab ini; setelah kembali, masukkan ulang PIN. PIN tidak disimpan selama redirect.'
      : 'Pendaftaran hanya tersedia jika server mengonfirmasi belum ada credential. Google akan diminta re-authentication baru; server membuat verifier scrypt dan menyimpannya pada dokumen Firestore server-only.';
  } else if (state === 'enrollment-blocked') {
    title = 'PIN akun belum terdaftar';
    detail = 'Pendaftaran aman belum diaktifkan di lingkungan ini. CRM, Firestore, dan antrean tetap ditahan. Jangan masukkan PIN lokal sebagai pengganti.';
  } else if (state === 'unavailable') {
    title = 'Verifikasi server belum tersedia';
    detail = 'Backend PIN akun belum aktif atau tidak dapat dijangkau. Akses cloud tetap ditahan; PIN lokal maupun localStorage tidak digunakan pada jalur hosted.';
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#fcfcfa] p-6">
      <section className="w-full max-w-md space-y-4 rounded-[12px] border border-[#eae4d5] bg-white p-6 shadow-sm">
        <h1 className="text-xl font-bold text-[#1f1f1f]">{title}</h1>
        <p className="text-sm leading-6 text-[#6b665c]">{detail}</p>
        {state === 'checking' && <p role="status" className="text-xs text-[#6b665c]">Sesi antrean dan data CRM belum diaktifkan.</p>}

        {(state === 'pin-required' || isEnrollment) && (
          <form onSubmit={handleSubmit} autoComplete="off" className="space-y-3">
            {isEnrollment && (
              <div role="note" className="rounded-[8px] border border-[#9b2c2c]/30 bg-[#fff5f0] p-3 text-xs leading-5 text-[#9b2c2c]">
                Reset mandiri belum tersedia. Jika PIN terlupa, akses tetap terkunci sampai prosedur pemulihan terverifikasi dibuat. Pendaftaran ini tidak dapat menimpa credential yang sudah ada.
              </div>
            )}
            <label className="block space-y-1 text-xs font-semibold text-[#6b665c]">
              <span>{isEnrollment ? 'PIN akun baru' : 'PIN akun'}</span>
              <input
                type="password"
                name="account-pin"
                inputMode="numeric"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                maxLength={12}
                pattern="[0-9]{6,12}"
                value={pin}
                onChange={(event) => setPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                className="w-full rounded-[8px] border border-[#eae4d5] bg-[#fcfcfa] px-3 py-2 font-mono tracking-[0.3em] text-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-[#ff4800]"
                required
              />
            </label>
            {isEnrollment && (
              <label className="block space-y-1 text-xs font-semibold text-[#6b665c]">
                <span>Ulangi PIN akun</span>
                <input
                  type="password"
                  name="account-pin-confirm"
                  inputMode="numeric"
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  maxLength={12}
                  pattern="[0-9]{6,12}"
                  value={confirmPin}
                  onChange={(event) => setConfirmPin(event.target.value.replace(/\D/g, '').slice(0, 12))}
                  className="w-full rounded-[8px] border border-[#eae4d5] bg-[#fcfcfa] px-3 py-2 font-mono tracking-[0.3em] text-[#1f1f1f] focus:outline-none focus:ring-2 focus:ring-[#ff4800]"
                  required
                />
              </label>
            )}
            {error && <p role="alert" className="text-xs leading-5 text-[#9b2c2c]">{error}</p>}
            <button
              type="submit"
              disabled={busy || pin.length < 6 || (isEnrollment && (confirmPin.length < 6 || pin !== confirmPin))}
              className="w-full rounded-[8px] bg-[#ff4800] px-4 py-2.5 text-sm font-bold text-white hover:bg-[#d93d00] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy
                ? isEnrollment && reauthenticationRedirect ? 'Mengalihkan ke Google…' : 'Memverifikasi…'
                : isEnrollment
                  ? reauthenticationRedirect ? 'Lanjutkan ke Google' : 'Re-auth Google dan daftarkan PIN'
                  : 'Verifikasi PIN akun'}
            </button>
          </form>
        )}

        {status?.sessionActive === false && state !== 'checking' && (
          <p className="text-xs text-[#6b665c]">Antrean lokal yang sudah ada tidak dihapus atau direset; antrean baru akan dibuka hanya setelah sesi server aktif.</p>
        )}
        {state === 'unavailable' || state === 'enrollment-blocked' ? (
          <button onClick={onRetry} className="rounded-[8px] border border-[#eae4d5] px-3 py-2 text-sm font-semibold text-[#6b665c]">Coba lagi</button>
        ) : null}
        <button onClick={onSignOut} className="rounded-[8px] border border-[#eae4d5] px-3 py-2 text-sm font-semibold text-[#6b665c]">Keluar</button>
      </section>
    </main>
  );
}
