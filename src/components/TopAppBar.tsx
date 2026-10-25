import { RefreshCw, Smartphone, Monitor, WifiOff, Code2, ShieldCheck, Shield, FileSpreadsheet } from 'lucide-react';

interface TopAppBarProps {
  title: string;
  isOnline: boolean;
  isSimulatedOffline: boolean;
  onToggleSimulatedOffline: () => void;
  pendingCount: number;
  isSyncing: boolean;
  onSyncNow: () => void;
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
  isSyncing,
  onSyncNow,
  isPhoneFrame,
  onTogglePhoneFrame,
  isAndroidCodeActive = false,
  onToggleAndroidCode,
  onOpenSecurity,
  isSecurityActive = false,
  onExportCsv,
}) => {
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
              <span className="text-[#1A2E40] font-semibold">AR Cloud Sync Engine</span>
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
                    {pendingCount}
                  </span>
                )}
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-[#ff4800]"></span>
                <span className="hidden sm:inline">Live</span>
              </>
            )}
          </button>

          {/* Sync Trigger Button */}
          <button
            onClick={onSyncNow}
            disabled={isSyncing}
            title="Sync changes with Cloud Database"
            className="flex items-center gap-1.5 bg-[#f8f5ee] hover:bg-[#f2ede4] text-[#1f1f1f] border border-[#1f1f1f] px-3 py-1.5 rounded-[8px] text-xs font-semibold transition-all disabled:opacity-50"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 text-[#ff4800] ${isSyncing ? 'animate-spin' : ''}`}
            />
            <span className="hidden md:inline">
              {isSyncing ? 'Syncing...' : pendingCount > 0 ? `Sync (${pendingCount})` : 'Sync'}
            </span>
          </button>

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
