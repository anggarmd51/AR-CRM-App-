import { useState } from 'react';
import { RefreshCw, Smartphone, Monitor, WifiOff, Code2, ShieldCheck, Shield, FileSpreadsheet, AlertCircle, Clock3, CheckCircle2 } from 'lucide-react';
import { formatNumber } from '../utils/crmCalculations.ts';
import type { SyncQueueOperation } from '../utils/syncQueue.ts';

interface TopAppBarProps {
  title: string;
  isOnline: boolean;
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  pendingCount: number;
  failedCount: number;
  acknowledgedCount: number;
  manualReplayCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
  syncOperations: SyncQueueOperation[];
  onRetrySyncOperation: (id: string) => void;
  isPhoneFrame: boolean;
  onTogglePhoneFrame: () => void;
  isAndroidCodeActive?: boolean;
  onToggleAndroidCode?: () => void;
  onOpenSecurity?: () => void;
  isSecurityActive?: boolean;
  onExportCsv?: () => void;
}

export const TopAppBar: React.FC<TopAppBarProps> = ({
  title,
  isOnline,
  isSimulatedOffline,
  onToggleSimulatedOffline,
  pendingCount,
  failedCount,
  acknowledgedCount,
  manualReplayCount,
  isSyncing,
  onSyncNow,
  syncOperations,
  onRetrySyncOperation,
  isPhoneFrame,
  onTogglePhoneFrame,
  isAndroidCodeActive = false,
  onToggleAndroidCode,
  onOpenSecurity,
  isSecurityActive = false,
  onExportCsv,
}) => {
  const [isSyncQueueOpen, setIsSyncQueueOpen] = useState(false);

  return (
    <header className="sticky top-0 z-30 bg-[#fcfcfa] border-b border-[#1f1f1f] px-4 py-3">
      <div className="flex items-center justify-between gap-2 max-w-7xl mx-auto">
        {/* Left: Branding & Editorial Title */}
        <div className="flex items-center gap-3 min-w-0">
          {/* Official AR CRM Brand Mark: Navy Blue #1A2E40 with Sprout/Hub Orange #FF4800 Network Node */}
          <div className="relative shrink-0 flex items-center justify-center">
            <img
              src="/assets/aistudio/Logo_AR_CRM_dengan_Hub_Oranye_ce6dcc6a.png"
              alt="AR CRM"
              className="w-10 h-10 object-contain rounded-[8px] bg-white border border-[#1f1f1f] shadow-none"
            />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[#1f1f1f] tracking-tight truncate leading-tight font-serif-heading">
              {title}
            </h1>
            <p className="text-[11px] text-[#6b665c] font-medium truncate flex items-center gap-1.5">
              <span className={`${isOnline ? 'text-[#155e3c]' : 'text-[#ff4800]'} font-semibold`}>{isOnline ? 'Workspace owner' : 'Workspace owner · offline'}</span>
              <span className="inline-block w-1 h-1 rounded-full bg-[#1f1f1f]/30"></span>
              <span>AR Editorial System</span>
            </p>
          </div>
        </div>

        {/* Right: Sync Status & Controls */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Offline / Online indicator & toggle (8px border radius, hairline 1px border) */}
          <button
            onClick={onToggleSimulatedOffline}
            title={isSimulatedOffline ? 'Simulating Offline: Click to go Online' : 'Network Online: Click to simulate Offline mode'}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#1f1f1f] transition-all ${
              !isOnline
                ? 'bg-[#f8f5ee] text-[#1f1f1f]'
                : 'bg-[#fcfcfa] text-[#1f1f1f]'
            }`}
          >
            {!isOnline ? (
              <>
                <WifiOff className="w-3.5 h-3.5 text-[#ff4800]" />
                <span className="hidden sm:inline">Offline</span>
                {pendingCount > 0 && (
                  <span className="bg-[#1f1f1f] text-[#fcfcfa] px-1.5 py-0.2 rounded-[4px] text-[10px] font-mono">
                    {formatNumber(pendingCount)}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#ff4800]"></span>
                <span className="hidden sm:inline">Online</span>
              </>
            )}
          </button>

          {/* Visible queue status and recovery actions */}
          <div className="relative">
            <button
              onClick={() => setIsSyncQueueOpen((open) => !open)}
              aria-expanded={isSyncQueueOpen}
              aria-controls="firestore-sync-queue"
              title="Lihat status dan antrean sinkronisasi Firestore"
              className={`flex items-center gap-1.5 border border-[#1f1f1f] px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-all ${failedCount > 0 ? 'bg-[#fff5f5] text-[#9b2c2c]' : 'bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f]'}`}
            >
              {failedCount > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : <RefreshCw className={`w-3.5 h-3.5 text-[#ff4800] ${isSyncing ? 'animate-spin' : ''}`} />}
              <span className="hidden md:inline">
                {failedCount > 0
                  ? `Gagal (${formatNumber(failedCount)})`
                  : isSyncing
                    ? 'Menyinkronkan'
                    : pendingCount > 0
                      ? `Menunggu (${formatNumber(pendingCount)})`
                      : acknowledgedCount > 0
                        ? 'Diakui Firestore'
                        : 'Antrean kosong'}
              </span>
              {(pendingCount > 0 || failedCount > 0) && (
                <span className="rounded-[4px] bg-[#1f1f1f] px-1.5 text-[10px] font-mono text-[#fcfcfa]">
                  {formatNumber(pendingCount + failedCount)}
                </span>
              )}
            </button>

            {isSyncQueueOpen && (
              <section id="firestore-sync-queue" aria-label="Antrean sinkronisasi Firestore" className="absolute right-0 top-full z-50 mt-2 w-[min(22rem,calc(100vw-1.5rem))] rounded-[12px] border border-[#1f1f1f] bg-[#fcfcfa] p-3 shadow-lg">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-[#1f1f1f]">Status sinkronisasi</h2>
                  <button onClick={onSyncNow} disabled={!isOnline || isSyncing || (manualReplayCount === 0 && failedCount === 0)} className="rounded-[6px] border border-[#1f1f1f] px-2 py-1 text-[11px] font-semibold disabled:opacity-50">
                    {manualReplayCount > 0
                      ? `Sinkronkan mutasi tersimpan (${formatNumber(manualReplayCount)})`
                      : failedCount > 0 ? 'Coba lagi yang gagal' : 'Tidak ada tindakan manual'}
                  </button>
                </div>
                {manualReplayCount > 0 && (
                  <p role="status" className="mb-2 rounded-[8px] border border-[#ff4800]/30 bg-[#fff8f3] p-2 text-[11px] leading-4 text-[#6b665c]">
                    {formatNumber(manualReplayCount)} mutasi tertunda dipulihkan dari sesi sebelumnya. Belum dikirim; pilih sinkronisasi manual untuk mengirimnya. Isi prospek dan aktivitas tidak ditampilkan.
                  </p>
                )}
                {syncOperations.length === 0 ? (
                  <p className="text-xs text-[#155e3c]">Tidak ada operasi antrean aktif di halaman ini.</p>
                ) : (
                  <ul className="max-h-64 space-y-2 overflow-y-auto">
                    {syncOperations.map((operation) => (
                      <li key={operation.id} className="rounded-[8px] border border-[#eae4d5] bg-white p-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-xs font-semibold text-[#1f1f1f]">{operation.label}</p>
                            <p className={`mt-0.5 flex items-center gap-1 text-[11px] ${operation.state === 'failed' ? 'text-[#9b2c2c]' : 'text-[#6b665c]'}`}>
                              {operation.state === 'failed'
                                ? <AlertCircle className="h-3 w-3" />
                                : operation.state === 'acknowledged'
                                  ? <CheckCircle2 className="h-3 w-3 text-[#155e3c]" />
                                  : operation.state === 'syncing'
                                    ? <RefreshCw className="h-3 w-3 animate-spin" />
                                    : <Clock3 className="h-3 w-3" />}
                              {operation.state === 'failed'
                                ? 'Gagal — perlu tindakan'
                                : operation.state === 'acknowledged'
                                  ? 'Diakui Firestore'
                                  : operation.state === 'syncing'
                                    ? 'Mengirim ke Firestore'
                                    : operation.requiresManualReplay
                                      ? 'Dipulihkan dari sesi sebelumnya — menunggu tindakan owner'
                                    : operation.dependencyBlocked
                                      ? 'Menunggu lead diakui Firestore'
                                      : 'Masuk antrean lokal — menunggu koneksi'}
                            </p>
                          </div>
                          {operation.canRetry && (
                            <button onClick={() => onRetrySyncOperation(operation.id)} disabled={!isOnline && operation.requiresManualReplay} className="shrink-0 rounded-[6px] bg-[#1f1f1f] px-2 py-1 text-[11px] font-semibold text-white disabled:opacity-50">
                              {operation.requiresManualReplay ? 'Kirim sekarang' : 'Coba lagi'}
                            </button>
                          )}
                        </div>
                        {operation.errorMessage && <p className="mt-1.5 text-[11px] leading-4 text-[#6b665c]">{operation.errorMessage}</p>}
                      </li>
                    ))}
                  </ul>
                )}
                <p className="mt-2 border-t border-[#eae4d5] pt-2 text-[10px] leading-4 text-[#6b665c]">
                  Mutasi tertunda disimpan dalam outbox IndexedDB terenkripsi per workspace dan UID; payload dibatasi ke field yang diperlukan dan dihapus setelah acknowledgement. Data tetap berada di profil browser, tidak menjadi backup, dan XSS pada origin yang sama tetap dapat mengakses data saat aplikasi berjalan.
                </p>
              </section>
            )}
          </div>

          {/* Android Native Architecture (Relocated from Bottom Bar to keep 4 core sales tabs) */}
          {onToggleAndroidCode && (
            <button
              onClick={onToggleAndroidCode}
              title="View Android Native Architecture & Room/Compose source code"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#1f1f1f] transition-all ${
                isAndroidCodeActive
                  ? 'bg-[#1f1f1f] text-white'
                  : 'bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f]'
              }`}
            >
              <Code2 className={`w-3.5 h-3.5 ${isAndroidCodeActive ? 'text-white' : 'text-[#ff4800]'}`} />
              <span className="hidden sm:inline">Android Code</span>
            </button>
          )}

          {/* Export CSV Rekapitulasi */}
          {onExportCsv && (
            <button
              onClick={onExportCsv}
              title="Download Rekapitulasi Leads (CSV)"
              className="flex items-center gap-1.5 bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f] border border-[#1f1f1f] px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-all active:scale-95"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-[#ff4800]" />
              <span className="hidden xl:inline">Export CSV</span>
            </button>
          )}

          {/* Security PIN Lock Settings */}
          {onOpenSecurity && (
            <button
              onClick={onOpenSecurity}
              title={isSecurityActive ? "Kunci PIN Aktif: Klik untuk Pengaturan" : "Atur Kunci PIN Keamanan"}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#1f1f1f] transition-all ${
                isSecurityActive
                  ? 'bg-[#edf7f1] text-[#155e3c] border-[#155e3c]/40'
                  : 'bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f]'
              }`}
            >
              {isSecurityActive ? (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-[#155e3c]" />
                  <span className="hidden sm:inline">PIN On</span>
                </>
              ) : (
                <>
                  <Shield className="w-3.5 h-3.5 text-[#6b665c]" />
                  <span className="hidden sm:inline">Keamanan</span>
                </>
              )}
            </button>
          )}

          {/* Phone Frame Toggle */}
          <button
            onClick={onTogglePhoneFrame}
            title={isPhoneFrame ? 'Switch to Full Page Layout' : 'Switch to Mobile Frame'}
            className="hidden lg:flex items-center gap-1.5 bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f] px-3 py-1.5 rounded-[8px] text-xs font-semibold border border-[#1f1f1f] transition-colors"
          >
            {isPhoneFrame ? (
              <>
                <Monitor className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Full Canvas</span>
              </>
            ) : (
              <>
                <Smartphone className="w-3.5 h-3.5 text-[#ff4800]" />
                <span>Mobile Frame</span>
              </>
            )}
          </button>
        </div>
      </div>
    </header>
  );
};
