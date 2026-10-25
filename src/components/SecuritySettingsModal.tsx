import React, { useState } from 'react';
import { X, ShieldCheck, Lock, Fingerprint, Clock, Check, AlertTriangle, KeyRound } from 'lucide-react';
import { SecurityVault } from '../utils/securityLock.ts';

interface SecuritySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLockNow: () => void;
}

export const SecuritySettingsModal: React.FC<SecuritySettingsModalProps> = ({
  isOpen,
  onClose,
  onLockNow,
}) => {
  const [isEnabled, setIsEnabled] = useState(SecurityVault.isSecurityEnabled());
  const [hasExistingPin, setHasExistingPin] = useState(SecurityVault.hasPin());
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [useBiometric, setUseBiometric] = useState(SecurityVault.isBiometricEnabled());
  const [timeoutMins, setTimeoutMins] = useState(SecurityVault.getTimeoutMinutes());
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  if (!isOpen) return null;

  const handleSavePin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPin.length < 4) {
      setMessage({ type: 'error', text: 'PIN minimal harus 4 digit angka.' });
      return;
    }
    if (newPin !== confirmPin) {
      setMessage({ type: 'error', text: 'Konfirmasi PIN tidak cocok.' });
      return;
    }

    await SecurityVault.setPin(newPin);
    SecurityVault.setSecurityEnabled(true);
    SecurityVault.setBiometricEnabled(useBiometric);
    SecurityVault.setTimeoutMinutes(timeoutMins);

    setIsEnabled(true);
    setHasExistingPin(true);
    setNewPin('');
    setConfirmPin('');
    setMessage({ type: 'success', text: 'Pengaturan keamanan PIN berhasil disimpan!' });
  };

  const handleToggleEnable = (enabled: boolean) => {
    if (enabled && !hasExistingPin) {
      setMessage({ type: 'error', text: 'Silakan atur PIN 4-6 digit terlebih dahulu.' });
      return;
    }
    SecurityVault.setSecurityEnabled(enabled);
    setIsEnabled(enabled);
    setMessage({
      type: 'success',
      text: enabled ? 'Kunci keamanan diaktifkan.' : 'Kunci keamanan dinonaktifkan.',
    });
  };

  const handleDisableAndReset = () => {
    if (confirm('Nonaktifkan dan hapus seluruh kunci PIN keamanan lokal?')) {
      SecurityVault.resetAllSecurity();
      setIsEnabled(false);
      setHasExistingPin(false);
      setNewPin('');
      setConfirmPin('');
      setMessage({ type: 'success', text: 'PIN berhasil direset dan dinonaktifkan.' });
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#1f1f1f]/50 backdrop-blur-xs overflow-y-auto">
      <div className="bg-[#fcfcfa] border border-[#1f1f1f] rounded-[16px] w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-6">
        {/* Header */}
        <div className="px-5 py-4 border-b border-[#1f1f1f] flex items-center justify-between bg-[#f8f5ee]">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-[8px] bg-[#1f1f1f] text-[#ff4800]">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-[#1f1f1f] text-base font-serif-heading">
                Keamanan & Kunci Aplikasi
              </h3>
              <p className="text-xs text-[#6b665c]">
                Kunci tampilan lokal perangkat
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-[8px] hover:bg-[#eae4d5] text-[#1f1f1f] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-5 space-y-4 text-xs">
          <p role="note" className="rounded-[8px] border border-[#9b2c2c]/30 bg-[#fff5f0] p-3 text-[11px] text-[#9b2c2c]">
            PIN/biometrik ini hanya mengunci tampilan pada perangkat. Ini bukan login akun dan tidak mengenkripsi data browser.
          </p>
          {message && (
            <div
              className={`p-3 rounded-[8px] border text-xs font-semibold flex items-center gap-2 ${
                message.type === 'success'
                  ? 'bg-[#edf7f1] border-[#155e3c]/30 text-[#155e3c]'
                  : 'bg-[#fff5f0] border-[#ff4800]/40 text-[#ff4800]'
              }`}
            >
              <Check className="w-4 h-4 shrink-0" />
              <span>{message.text}</span>
            </div>
          )}

          {/* Toggle Security Switch */}
          <div className="bg-[#f8f5ee] border border-[#1f1f1f] rounded-[12px] p-3.5 flex items-center justify-between">
            <div className="space-y-0.5">
              <span className="font-bold text-[#1f1f1f] text-xs flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-[#ff4800]" />
                Aktifkan Kunci PIN Aplikasi
              </span>
              <p className="text-[11px] text-[#6b665c]">
                Minta verifikasi PIN saat aplikasi dibuka dari background
              </p>
            </div>
            <button
              type="button"
              onClick={() => handleToggleEnable(!isEnabled)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                isEnabled ? 'bg-[#ff4800]' : 'bg-[#1f1f1f]/30'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  isEnabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Set / Change PIN Form */}
          <form onSubmit={handleSavePin} className="space-y-3 bg-[#fcfcfa] border border-[#1f1f1f] rounded-[12px] p-3.5">
            <div className="flex items-center gap-1.5 font-bold text-[#1f1f1f]">
              <KeyRound className="w-3.5 h-3.5 text-[#ff4800]" />
              <span>{hasExistingPin ? 'Perbarui PIN Keamanan' : 'Atur PIN Baru (4-6 Digit)'}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-[11px] text-[#6b665c] font-semibold">PIN Baru</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 1234"
                  value={newPin}
                  onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-xs font-mono tracking-widest text-[#1f1f1f] focus:outline-none focus:bg-white"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] text-[#6b665c] font-semibold">Ulangi PIN</label>
                <input
                  type="password"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="e.g. 1234"
                  value={confirmPin}
                  onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ''))}
                  className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-3 py-2 text-xs font-mono tracking-widest text-[#1f1f1f] focus:outline-none focus:bg-white"
                />
              </div>
            </div>

            {/* Timeout Option */}
            <div className="space-y-1 pt-1">
              <label className="text-[11px] text-[#6b665c] font-semibold flex items-center gap-1">
                <Clock className="w-3 h-3 text-[#1f1f1f]" />
                Otomatis Kunci Setelah:
              </label>
              <select
                value={timeoutMins}
                onChange={(e) => setTimeoutMins(parseInt(e.target.value, 10))}
                className="w-full bg-[#f8f5ee] border border-[#1f1f1f] rounded-[8px] px-2.5 py-1.5 text-xs text-[#1f1f1f] font-medium"
              >
                <option value={0}>Segera (Tiap buka dari background)</option>
                <option value={1}>1 Menit tidak aktif</option>
                <option value={5}>5 Menit tidak aktif (Standar)</option>
                <option value={15}>15 Menit tidak aktif</option>
              </select>
            </div>

            {/* Biometric Toggle if supported */}
            {SecurityVault.isBiometricSupported() && (
              <label className="flex items-center gap-2 pt-1 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useBiometric}
                  onChange={(e) => setUseBiometric(e.target.checked)}
                  className="rounded text-[#ff4800] focus:ring-[#ff4800]"
                />
                <span className="text-xs text-[#1f1f1f] font-semibold flex items-center gap-1">
                  <Fingerprint className="w-3.5 h-3.5 text-[#ff4800]" />
                  Izinkan Sidik Jari / Biometrik Perangkat
                </span>
              </label>
            )}

            <button
              type="submit"
              disabled={newPin.length < 4 || newPin !== confirmPin}
              className="w-full bg-[#ff4800] hover:bg-[#e03f00] text-white font-bold py-2 px-3 rounded-[8px] border border-[#1f1f1f] transition-all disabled:opacity-40"
            >
              Simpan Pengaturan PIN
            </button>
          </form>

          {/* Action Footer Buttons */}
          <div className="flex items-center justify-between pt-2 border-t border-[#1f1f1f]/10">
            {hasExistingPin && (
              <button
                type="button"
                onClick={handleDisableAndReset}
                className="text-[11px] text-[#ff4800] hover:underline font-semibold"
              >
                Reset / Hapus PIN
              </button>
            )}

            <div className="flex items-center gap-2 ml-auto">
              {isEnabled && hasExistingPin && (
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onLockNow();
                  }}
                  className="bg-[#1f1f1f] hover:bg-black text-white text-xs font-bold px-3 py-2 rounded-[8px] border border-[#1f1f1f] flex items-center gap-1.5 transition-all"
                >
                  <Lock className="w-3.5 h-3.5 text-[#ff4800]" />
                  <span>Kunci Sekarang</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="bg-[#f8f5ee] hover:bg-[#eae4d5] text-[#1f1f1f] text-xs font-semibold px-4 py-2 rounded-[8px] border border-[#1f1f1f]"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
