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
import { firestoreWriteQueue, type SyncQueueSnapshot } from './utils/syncQueue.ts';
import type { DurableMutation } from './utils/offlineOutbox.ts';
import { createAppHistoryState, getClosedModalNames, readAppHistoryState, type AppHistoryState, type AppModalName } from './utils/appHistory.ts';

const APP_TABS: readonly NavTab[] = ['dashboard', 'pipeline', 'leads_finder', 'activities', 'android_code'];

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [globalLeads, setGlobalLeads] = useState<GlobalLead[]>([]);
  const [syncQueueSnapshot, setSyncQueueSnapshot] = useState<SyncQueueSnapshot>(() => firestoreWriteQueue.getSnapshot());
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine);
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
  const historyEntryRef = useRef<AppHistoryState<NavTab> | null>(null);
  const modalBackPendingRef = useRef(false);

  // Track double tap back to exit on root dashboard
  const lastBackPressTimeRef = useRef<number>(0);

  // Each app history entry captures both the selected tab and its modal stack.
  const openModalWithHistory = useCallback((openFn: () => void, modalName: AppModalName) => {
    if (typeof window !== 'undefined') {
      const current = readAppHistoryState(window.history.state, APP_TABS)
        ?? historyEntryRef.current
        ?? createAppHistoryState(currentTabRef.current);
      const next = createAppHistoryState(current.tab, [...current.modalStack, modalName]);
      window.history.pushState(next, '');
      historyEntryRef.current = next;
      modalBackPendingRef.current = false;
    }
    openFn();
  }, []);

  // popstate is the single owner of modal close transitions; the click handler
  // only consumes the top modal entry and never closes a parent directly.
  const closeModalWithHistory = useCallback((modalName: AppModalName, closeFn: () => void) => {
    if (typeof window === 'undefined') {
      closeFn();
      return;
    }
    const current = readAppHistoryState(window.history.state, APP_TABS);
    if (current?.modalStack.length) {
      if (current.modalStack[current.modalStack.length - 1] !== modalName || modalBackPendingRef.current) return;
      modalBackPendingRef.current = true;
      window.history.back();
      return;
    }
    closeFn();
  }, []);

  // Tab changer with history entry
  const changeTabWithHistory = useCallback((tab: NavTab) => {
    if (tab === currentTabRef.current) return;
    if (typeof window !== 'undefined') {
      const current = readAppHistoryState(window.history.state, APP_TABS)
        ?? historyEntryRef.current
        ?? createAppHistoryState(currentTabRef.current);
      const next = createAppHistoryState(tab, current.modalStack);
      window.history.pushState(next, '');
      historyEntryRef.current = next;
    }
    setCurrentTab(tab);
  }, []);

  // Set up Mobile Back Gesture (popstate) Interceptor & App Lock on Resume
  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Establish a canonical current entry. A modal cannot be restored from a
    // browser entry alone after a full reload, so keep its tab but clear layers.
    const existingState = readAppHistoryState(window.history.state, APP_TABS);
    const initialState = createAppHistoryState(existingState?.tab ?? currentTabRef.current);
    window.history.replaceState(initialState, '');
    historyEntryRef.current = initialState;
    setCurrentTab(initialState.tab);

    const handlePopState = (event: PopStateEvent) => {
      const next = readAppHistoryState(event.state, APP_TABS);
      if (!next) {
        modalBackPendingRef.current = false;
        return;
      }
      const previous = historyEntryRef.current;
      historyEntryRef.current = next;
      modalBackPendingRef.current = false;
      setCurrentTab(next.tab);

      const closedModalNames = previous ? getClosedModalNames(previous, next) : [];
      for (const modalName of closedModalNames) {
        switch (modalName) {
          case 'activityLogger':
            setIsActivityLoggerOpen(false);
            setActivityLead(null);
            break;
          case 'whatsapp':
            setWhatsAppLead(null);
            break;
          case 'securitySettings':
            setIsSecuritySettingsOpen(false);
            break;
          case 'quickLead':
            setIsQuickLeadOpen(false);
            break;
          case 'leadDetail':
            setSelectedLead(null);
            break;
        }
      }

      // A popped modal or a tab transition is already fully handled by this
      // destination entry; neither should be interpreted as a second Back.
      if (closedModalNames.length > 0 || (previous && previous.tab !== next.tab) || next.modalStack.length > 0) {
        lastBackPressTimeRef.current = 0;
        return;
      }

      // 3. User is on Root Dashboard: double back confirmation to prevent accidental exit
      if (next.tab !== 'dashboard') return;
      const now = Date.now();
      if (now - lastBackPressTimeRef.current < 2000) {
        // Allow app exit / default behavior
        return;
      } else {
        lastBackPressTimeRef.current = now;
        const rootEntry = createAppHistoryState('dashboard');
        window.history.pushState(rootEntry, '');
        historyEntryRef.current = rootEntry;
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

  useEffect(() => firestoreWriteQueue.subscribe(setSyncQueueSnapshot), []);

  const acknowledgedCountRef = useRef(syncQueueSnapshot.acknowledgedCount);
  useEffect(() => {
    const newlyAcknowledged = syncQueueSnapshot.acknowledgedCount - acknowledgedCountRef.current;
    acknowledgedCountRef.current = syncQueueSnapshot.acknowledgedCount;
    if (newlyAcknowledged > 0) {
      showToast(`${formatNumber(newlyAcknowledged)} operasi diakui Firestore.`);
    }
  }, [syncQueueSnapshot.acknowledgedCount, showToast]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  useEffect(() => {
    setSelectedLead((current) => {
      if (!current) return current;
      return leads.find((lead) => lead.id === current.id) ?? current;
    });
  }, [leads]);

  // Actions
  const handleToggleSimulatedOffline = () => {
    showToast('Mode offline lokal dinonaktifkan: Firebase tetap menjadi sumber data CRM.');
  };

  const handleSyncNow = async () => {
    const retryCount = firestoreWriteQueue.retryFailed();
    if (!isOnline) {
      showToast('Offline — Firestore akan melanjutkan operasi tertunda saat koneksi pulih.');
    } else if (retryCount > 0) {
      showToast(`Mencoba ulang ${formatNumber(retryCount)} operasi yang gagal.`);
    } else if (syncQueueSnapshot.pendingCount + syncQueueSnapshot.syncingCount > 0) {
      showToast('Firestore sedang memproses operasi antrean; lihat status di bar atas.');
    } else {
      showToast('Tidak ada operasi tertunda atau gagal.');
    }
  };

  const handleRetrySyncOperation = (id: string) => {
    void firestoreWriteQueue.retry(id).catch(() => undefined);
  };

  const handleCorrectSyncOperation = async (id: string, mutation: DurableMutation) => {
    await firestoreWriteQueue.correctFailedOperation(id, mutation);
    showToast('Koreksi tersimpan di antrean lokal dengan ID yang sama; menunggu pengakuan Firestore.');
  };

  // Add Lead
  const handleAddLead = async (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => {
    await createLead(getFirebaseAuth().currentUser!.uid, leadData);
    showToast(`Lead "${leadData.company_name}" tersimpan di antrean lokal; menunggu pengakuan Firestore.`);
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
      showToast('Perubahan stage masuk antrean lokal; belum diakui Firestore.');
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
      showToast('Aktivitas tersimpan di antrean lokal; belum diakui Firestore.');
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
      showToast(`"${globalLead.company_name}" tersimpan di antrean lokal; menunggu pengakuan Firestore.`);
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
  const pendingCount = syncQueueSnapshot.pendingCount + syncQueueSnapshot.syncingCount;
  const isSyncing = syncQueueSnapshot.isSyncing;

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
          failedCount={syncQueueSnapshot.failedCount}
          acknowledgedCount={syncQueueSnapshot.acknowledgedCount}
          isSyncing={isSyncing}
          onSyncNow={handleSyncNow}
          syncOperations={syncQueueSnapshot.operations}
          onRetrySyncOperation={handleRetrySyncOperation}
          onLoadFailedMutation={(id) => firestoreWriteQueue.getFailedMutation(id)}
          onCorrectFailedMutation={handleCorrectSyncOperation}
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
          onClose={() => closeModalWithHistory('quickLead', () => setIsQuickLeadOpen(false))}
          onAddLead={handleAddLead}
        />

        <ActivityLoggerModal
          isOpen={isActivityLoggerOpen}
          onClose={() =>
            closeModalWithHistory('activityLogger', () => {
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
          onClose={() => closeModalWithHistory('leadDetail', () => setSelectedLead(null))}
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
          onClose={() => closeModalWithHistory('whatsapp', () => setWhatsAppLead(null))}
          lead={whatsAppLead}
        />

        <SecuritySettingsModal
          isOpen={isSecuritySettingsOpen}
          onClose={() => closeModalWithHistory('securitySettings', () => setIsSecuritySettingsOpen(false))}
          onLockNow={() => {
            closeModalWithHistory('securitySettings', () => setIsSecuritySettingsOpen(false));
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
