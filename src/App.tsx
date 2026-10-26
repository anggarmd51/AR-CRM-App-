/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopAppBar } from './components/TopAppBar.tsx';
import { BottomNavBar, NavTab } from './components/BottomNavBar.tsx';
import { DashboardView } from './components/DashboardView.tsx';
import { PipelineKanbanView } from './components/PipelineKanbanView.tsx';
import { GlobalLeadsView } from './components/GlobalLeadsView.tsx';
import { ActivitiesListView } from './components/ActivitiesListView.tsx';
import { AndroidCodeExplorer } from './components/AndroidCodeExplorer.tsx';
import { QuickLeadModal } from './components/QuickLeadModal.tsx';
import { ActivityLoggerModal } from './components/ActivityLoggerModal.tsx';
import { LeadDetailModal } from './components/LeadDetailModal.tsx';
import { WhatsAppModal } from './components/WhatsAppModal.tsx';
import { SecurityLockScreen } from './components/SecurityLockScreen.tsx';
import { SecuritySettingsModal } from './components/SecuritySettingsModal.tsx';
import { AndroidFrame } from './components/AndroidFrame.tsx';
import { Lead, Activity, GlobalLead, PipelineStage } from './types/crm.ts';
import { filterFollowUps, formatNumber } from './utils/crmCalculations.ts';
import { downloadLeadsCsv } from './utils/exportCsv.ts';
import { SecurityVault } from './utils/securityLock.ts';
import { CheckCircle2 } from 'lucide-react';
import { getFirebaseAuth } from './firebase.ts';
import { createActivity, createLead, subscribeToActivities, subscribeToLeads, updateLeadStage } from './firebaseRepository.ts';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [globalLeads, setGlobalLeads] = useState<GlobalLead[]>([]);
  const [pendingCount] = useState<number>(0);
  const [isSyncing] = useState<boolean>(false);
  const [isSimulatedOffline] = useState<boolean>(false);
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(false);

  // Security Vault & Lock State
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => SecurityVault.isCurrentlyLocked());
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);

  // Modals
  const [isQuickLeadOpen, setIsQuickLeadOpen] = useState(false);
  const [isActivityLoggerOpen, setIsActivityLoggerOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);

  // Snackbar Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  }, []);

  // Refs for robust popstate back gesture handling
  const currentTabRef = useRef(currentTab);
  currentTabRef.current = currentTab;
  const selectedLeadRef = useRef(selectedLead);
  selectedLeadRef.current = selectedLead;
  const isQuickLeadOpenRef = useRef(isQuickLeadOpen);
  isQuickLeadOpenRef.current = isQuickLeadOpen;
  const isActivityLoggerOpenRef = useRef(isActivityLoggerOpen);
  isActivityLoggerOpenRef.current = isActivityLoggerOpen;
  const whatsAppLeadRef = useRef(whatsAppLead);
  whatsAppLeadRef.current = whatsAppLead;
  const isSecuritySettingsOpenRef = useRef(isSecuritySettingsOpen);
  isSecuritySettingsOpenRef.current = isSecuritySettingsOpen;

  // Track double tap back to exit on root dashboard
  const lastBackPressTimeRef = useRef<number>(0);

  // Safe modal openers with history push for Android back gesture support
  const openModalWithHistory = useCallback((openFn: () => void, modalName: string) => {
    if (typeof window !== 'undefined') {
      window.history.pushState({ modal: true, modalName }, '');
    }
    openFn();
  }, []);

  // Safe modal closer that unwinds history state cleanly
  const closeModalWithHistory = useCallback((closeFn: () => void) => {
    closeFn();
    if (typeof window !== 'undefined' && window.history.state?.modal) {
      window.history.back();
    }
  }, []);

  // Tab changer with history entry
  const changeTabWithHistory = useCallback((tab: NavTab) => {
    if (tab === currentTabRef.current) return;
    if (typeof window !== 'undefined') {
      window.history.pushState({ tab }, '');
    }
    setCurrentTab(tab);
  }, []);

  // Set up Mobile Back Gesture (popstate) Interceptor & App Lock on Resume
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Establish root history state
    if (!window.history.state) {
      window.history.replaceState({ root: true, tab: 'dashboard' }, '');
    }

    const handlePopState = () => {
      // 1. LIFO: Close top-most / child modals first before parent LeadDetailModal
      if (isActivityLoggerOpenRef.current) {
        setIsActivityLoggerOpen(false);
        setActivityLead(null);
        return;
      }
      if (whatsAppLeadRef.current) {
        setWhatsAppLead(null);
        return;
      }
      if (isSecuritySettingsOpenRef.current) {
        setIsSecuritySettingsOpen(false);
        return;
      }
      if (isQuickLeadOpenRef.current) {
        setIsQuickLeadOpen(false);
        return;
      }
      if (selectedLeadRef.current) {
        setSelectedLead(null);
        return;
      }

      // 2. If no modal is open but user is on a secondary tab, navigate back to Dashboard
      if (currentTabRef.current !== 'dashboard') {
        setCurrentTab('dashboard');
        return;
      }

      // 3. User is on Root Dashboard: double back confirmation to prevent accidental exit
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // Allow app exit / default behavior
        return;
      } else {
        lastBackPressTimeRef.current = now;
        window.history.pushState({ root: true, tab: 'dashboard' }, '');
        showToast('Tekan kembali sekali lagi untuk keluar dari aplikasi.');
      }
    };

    window.addEventListener('popstate', handlePopState);

    // Auto-lock when resumed from background if timeout expired
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (SecurityVault.isCurrentlyLocked()) {
          setIsAppLocked(true);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [showToast]);

  // Firebase is the sole source of truth for authenticated CRM records. No
  // localStorage hydration or automatic migration is performed here.
  useEffect(() => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setGlobalLeads([]);
    const onError = (error: Error) => showToast(`Firebase gagal memuat data: ${error.message}`);
    const stopLeads = subscribeToLeads(user.uid, setLeads, onError);
    const stopActivities = subscribeToActivities(user.uid, setActivities, onError);
    return () => { stopLeads(); stopActivities(); };
  }, [showToast]);

  // Actions
  const handleToggleSimulatedOffline = () => {
    showToast('Mode offline lokal dinonaktifkan: Firebase tetap menjadi sumber data CRM.');
  };

  const handleSyncNow = async () => {
    showToast('Data CRM diperbarui real-time melalui Firebase; tidak ada antrian lokal untuk dikirim.');
  };

  // Add Lead
  const handleAddLead = async (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => {
    await createLead(getFirebaseAuth().currentUser!.uid, leadData);
    showToast(`Lead "${leadData.company_name}" disimpan di Firebase.`);
  };

  // Update Lead Stage (with automatic archive logging for Closing Won)
  const handleUpdateLeadStage = (
    leadId: string,
    newStage: PipelineStage,
    nextFollowupDate?: string
  ) => {
    void updateLeadStage(getFirebaseAuth().currentUser!.uid, leadId, newStage, nextFollowupDate).then(() => {
      setSelectedLead((prev) => (prev?.id === leadId ? {
        ...prev,
        pipeline_stage: newStage,
        ...(nextFollowupDate !== undefined ? { next_followup_date: nextFollowupDate } : {}),
      } : prev));
      showToast(`Stage diubah ke ${newStage}.`);
    }).catch((error: Error) => showToast(`Stage gagal diubah: ${error.message}`));
  };

  // Add Activity / Check-In
  const handleSaveActivity = async (activityData: {
    lead_id: string;
    activity_type: string;
    notes: string;
  }) => {
    try {
      await createActivity(getFirebaseAuth().currentUser!.uid, activityData);
      showToast('Aktivitas disimpan di Firebase.');
    } catch (error) {
      showToast(`Aktivitas gagal disimpan: ${(error as Error).message}`);
      throw error;
    }
  };

  // Import Global Lead
  const handleImportGlobalLead = async (globalLead: GlobalLead) => {
    try {
      await createLead(getFirebaseAuth().currentUser!.uid, {
        company_name: globalLead.company_name,
        contact_person: globalLead.contact_person,
        phone: globalLead.phone,
        industry: globalLead.industry,
        city: globalLead.city,
        pipeline_stage: 'Prospect',
        deal_value: Number(globalLead.estimated_value) || 0,
        next_followup_date: '',
        lead_score: 'Unrated',
      });
      showToast(`"${globalLead.company_name}" disimpan di Firebase.`);
    } catch (error) {
      showToast(`Lead gagal diimpor: ${(error as Error).message}`);
    }
  };

  // Export CSV Report
  const handleExportCsv = useCallback(() => {
    const currentLeads = leads;
    if (currentLeads.length === 0) {
      showToast('Tidak ada data prospek untuk diekspor.');
      return;
    }
    const filename = downloadLeadsCsv(currentLeads);
    showToast(`Laporan rekapitulasi ${formatNumber(currentLeads.length)} prospek berhasil diunduh (${filename})!`);
  }, [leads, showToast]);

  const followUpMetrics = filterFollowUps(leads);
  const dueCount = followUpMetrics.dueToday.length + followUpMetrics.overdue.length;
  const isOnline = typeof navigator === 'undefined' || navigator.onLine;

  const getTabTitle = () => {
    switch (currentTab) {
      case 'dashboard':
        return 'AR CRM';
      case 'pipeline':
        return 'Sales Pipeline';
      case 'leads_finder':
        return 'Lead Finder';
      case 'activities':
        return 'Field Activities';
      case 'android_code':
        return 'Android Architecture';
      default:
        return 'AR CRM';
    }
  };

  return (
    <AndroidFrame isPhoneFrame={isPhoneFrame} isOnline={isOnline}>
      <div className="flex-1 flex flex-col min-h-screen bg-[#fcfcfa]">
        {/* Top App Bar with Security Lock & CSV Export */}
        <TopAppBar
          title={getTabTitle()}
          isOnline={isOnline}
          isSimulatedOffline={isSimulatedOffline}
          onToggleSimulatedOffline={handleToggleSimulatedOffline}
          pendingCount={pendingCount}
          isSyncing={isSyncing}
          onSyncNow={handleSyncNow}
          isPhoneFrame={isPhoneFrame}
          onTogglePhoneFrame={() => setIsPhoneFrame(!isPhoneFrame)}
          isAndroidCodeActive={currentTab === 'android_code'}
          onToggleAndroidCode={() =>
            changeTabWithHistory(currentTab === 'android_code' ? 'dashboard' : 'android_code')
          }
          onOpenSecurity={() => openModalWithHistory(() => setIsSecuritySettingsOpen(true), 'securitySettings')}
          isSecurityActive={SecurityVault.isSecurityEnabled()}
          onExportCsv={handleExportCsv}
        />

        {/* Main Content Area */}
        <main className="flex-1 p-3.5 sm:p-6 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              leads={leads}
              activities={activities}
              onOpenQuickLead={() => openModalWithHistory(() => setIsQuickLeadOpen(true), 'quickLead')}
              onOpenActivityLogger={(lead) => {
                setActivityLead(lead || null);
                openModalWithHistory(() => setIsActivityLoggerOpen(true), 'activityLogger');
              }}
              onSelectLead={(lead) => openModalWithHistory(() => setSelectedLead(lead), 'leadDetail')}
              onOpenWhatsApp={(lead) => {
                setWhatsAppLead(lead);
                openModalWithHistory(() => setWhatsAppLead(lead), 'whatsapp');
              }}
              onNavigateToPipeline={() => changeTabWithHistory('pipeline')}
              onNavigateToFinder={() => changeTabWithHistory('leads_finder')}
              onExportCsv={handleExportCsv}
            />
          )}

          {currentTab === 'pipeline' && (
            <PipelineKanbanView
              leads={leads}
              onUpdateLeadStage={handleUpdateLeadStage}
              onSelectLead={(lead) => openModalWithHistory(() => setSelectedLead(lead), 'leadDetail')}
              onOpenQuickLead={() => openModalWithHistory(() => setIsQuickLeadOpen(true), 'quickLead')}
              onOpenWhatsApp={(lead) => {
                setWhatsAppLead(lead);
                openModalWithHistory(() => setWhatsAppLead(lead), 'whatsapp');
              }}
              onExportCsv={handleExportCsv}
            />
          )}

          {currentTab === 'leads_finder' && (
            <GlobalLeadsView
              personalLeads={leads}
              globalLeads={globalLeads}
              onImportGlobalLead={handleImportGlobalLead}
              onNavigateToPipeline={() => changeTabWithHistory('pipeline')}
            />
          )}

          {currentTab === 'activities' && (
            <ActivitiesListView
              activities={activities}
              leads={leads}
              onOpenActivityLogger={(lead) => {
                setActivityLead(lead || null);
                openModalWithHistory(() => setIsActivityLoggerOpen(true), 'activityLogger');
              }}
              onSelectLead={(lead) => openModalWithHistory(() => setSelectedLead(lead), 'leadDetail')}
            />
          )}

          {currentTab === 'android_code' && <AndroidCodeExplorer />}
        </main>

        {/* Android Material 3 Bottom Navigation Bar */}
        <BottomNavBar
          currentTab={currentTab}
          onSelectTab={changeTabWithHistory}
          followUpDueCount={dueCount}
        />

        {/* Android Snackbar Toast Notification: 8px radius, ink background, Sprout Orange icon */}
        {toastMessage && (
          <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#1f1f1f] text-[#fcfcfa] text-xs font-semibold px-4 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-2.5 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-[#ff4800] shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        )}

        {/* MODALS WITH MOBILE BACK GESTURE INTEGRATION */}
        <QuickLeadModal
          isOpen={isQuickLeadOpen}
          onClose={() => closeModalWithHistory(() => setIsQuickLeadOpen(false))}
          onAddLead={handleAddLead}
        />

        <ActivityLoggerModal
          isOpen={isActivityLoggerOpen}
          onClose={() =>
            closeModalWithHistory(() => {
              setIsActivityLoggerOpen(false);
              setActivityLead(null);
            })
          }
          leads={leads}
          initialLead={activityLead}
          onSaveActivity={handleSaveActivity}
        />

        <LeadDetailModal
          isOpen={!!selectedLead}
          onClose={() => closeModalWithHistory(() => setSelectedLead(null))}
          lead={selectedLead}
          activities={activities}
          onUpdateStage={handleUpdateLeadStage}
          onOpenActivityLogger={(l) => {
            setActivityLead(l);
            openModalWithHistory(() => setIsActivityLoggerOpen(true), 'activityLogger');
          }}
          onOpenWhatsApp={(l) => {
            setWhatsAppLead(l);
            openModalWithHistory(() => setWhatsAppLead(l), 'whatsapp');
          }}
        />

        <WhatsAppModal
          isOpen={!!whatsAppLead}
          onClose={() => closeModalWithHistory(() => setWhatsAppLead(null))}
          lead={whatsAppLead}
        />

        <SecuritySettingsModal
          isOpen={isSecuritySettingsOpen}
          onClose={() => closeModalWithHistory(() => setIsSecuritySettingsOpen(false))}
          onLockNow={() => {
            closeModalWithHistory(() => setIsSecuritySettingsOpen(false));
            SecurityVault.lockNow();
            setIsAppLocked(true);
          }}
        />

        {/* Local Security Shield Fullscreen Lock Overlay */}
        {isAppLocked && (
          <SecurityLockScreen
            onUnlocked={() => {
              SecurityVault.recordUnlock();
              setIsAppLocked(false);
            }}
          />
        )}
      </div>
    </AndroidFrame>
  );
}
