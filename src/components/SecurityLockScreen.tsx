import React, { useState, useEffect } from 'react';
import { Lock, Fingerprint, Delete, ShieldAlert, Sparkles, Check } from 'lucide-react';
import { SecurityVault } from '../utils/securityLock.ts';

interface SecurityLockScreenProps {
  onUnlocked: () => void;
}

export const SecurityLockScreen: React.FC<SecurityLockScreenProps> = ({ onUnlocked }) => {
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [targetPinLength, setTargetPinLength] = useState<number>(() => SecurityVault.getPinLength());

  useEffect(() => {
    setBiometricAvailable(SecurityVault.isBiometricSupported() && SecurityVault.isBiometricEnabled());
    setTargetPinLength(SecurityVault.getPinLength());
  }, []);

  const checkPin = async (candidatePin: string) => {
    setIsVerifying(true);
    const result = await SecurityVault.verifyPin(candidatePin);
    setIsVerifying(false);

    if (result.success) {
      onUnlocked();
    } else {
      if (result.rateLimited) {
        setError(`Terlalu banyak percobaan salah. Terkunci ${result.lockoutSeconds || 30}s.`);
      } else {
        setError('PIN tidak valid. Silakan coba lagi.');
      }
      setTimeout(() => {
        setPin('');
      }, 500);
    }
  };

  const handleKeyPress = (num: string) => {
    if (isVerifying) return;
    if (pin.length < targetPinLength) {
      const nextPin = pin + num;
      setPin(nextPin);
      setError(null);
      if (nextPin.length === targetPinLength) {
        checkPin(nextPin);
      }
    }
  };

  const handleDelete = () => {
    if (isVerifying) return;
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  };

  // Keyboard navigation support for desktop users
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key)) {
        handleKeyPress(e.key);
      } else if (e.key === 'Backspace') {
        handleDelete();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, targetPinLength, isVerifying]);

  const handleBiometricUnlock = async () => {
    const success = await SecurityVault.authenticateWithBiometrics();
    if (success) {
      onUnlocked();
    } else {
      setError('Biometrik tidak terdeteksi. Gunakan PIN Anda.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#1A2E40] text-[#fcfcfa] flex flex-col items-center justify-between p-6 select-none animate-in fade-in duration-200">
      {/* Top Header */}
      <div className="w-full max-w-xs flex flex-col items-center pt-8 space-y-3">
        <div className="w-16 h-16 rounded-[16px] bg-white border border-[#1f1f1f] p-2 flex items-center justify-center shadow-lg">
          <img
            src="/assets/aistudio/Logo_AR_CRM_dengan_Hub_Oranye_ce6dcc6a.png"
            alt="AR CRM"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="text-center space-y-1">
          <h2 className="text-lg font-bold tracking-tight font-serif-heading text-white">
            AR Personal CRM
          </h2>
          <p className="text-xs text-white/70 flex items-center justify-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#ff4800]" />
            <span>Sales Vault Terkunci</span>
          </p>
        </div>
      </div>

      {/* PIN Dots Indicator */}
      <div className="flex flex-col items-center space-y-3 my-auto">
        <div className="flex items-center gap-3">
          {Array.from({ length: targetPinLength }).map((_, idx) => {
            const isFilled = pin.length > idx;
            return (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full transition-all duration-200 border ${
                  isFilled
                    ? 'bg-[#ff4800] border-[#ff4800] scale-110'
                    : 'bg-white/10 border-white/40'
                }`}
              />
            );
          })}
        </div>
        {error ? (
          <p className="text-xs text-[#ff4800] font-semibold animate-pulse flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{error}</span>
          </p>
        ) : (
          <p className="text-[11px] text-white/60">
            {isVerifying ? 'Memverifikasi PIN...' : `Masukkan ${targetPinLength} digit PIN Anda`}
          </p>
        )}
      </div>

      {/* Numeric Keypad: 8px radius corporate styling */}
      <div className="w-full max-w-xs space-y-6 pb-6">
        <div className="grid grid-cols-3 gap-3">
          {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
            <button
              key={digit}
              type="button"
              onClick={() => handleKeyPress(digit)}
              className="h-14 rounded-[12px] bg-white/10 hover:bg-white/20 active:bg-[#ff4800] text-xl font-bold font-mono text-white flex items-center justify-center border border-white/15 transition-all active:scale-95"
            >
              {digit}
            </button>
          ))}

          {/* Biometrics or Empty */}
          {biometricAvailable ? (
            <button
              type="button"
              onClick={handleBiometricUnlock}
              title="Unlock with Fingerprint/Biometrics"
              className="h-14 rounded-[12px] bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center border border-white/15 transition-all active:scale-95"
            >
              <Fingerprint className="w-6 h-6 text-[#ff4800]" />
            </button>
          ) : (
            <div />
          )}

          <button
            type="button"
            onClick={() => handleKeyPress('0')}
            className="h-14 rounded-[12px] bg-white/10 hover:bg-white/20 active:bg-[#ff4800] text-xl font-bold font-mono text-white flex items-center justify-center border border-white/15 transition-all active:scale-95"
          >
            0
          </button>

          <button
            type="button"
            onClick={handleDelete}
            title="Hapus"
            className="h-14 rounded-[12px] bg-white/10 hover:bg-white/20 active:bg-white/30 text-white flex items-center justify-center border border-white/15 transition-all active:scale-95"
          >
            <Delete className="w-5 h-5 text-white/80" />
          </button>
        </div>

        <div className="text-center">
          <p className="text-[10px] text-white/40">
            AR CRM Local Security Shield • Enkripsi Lokal
          </p>
        </div>
      </div>
    </div>
  );
};
