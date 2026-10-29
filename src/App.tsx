/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { lazy, Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { TopAppBar } from './components/TopAppBar.tsx';
import { BottomNavBar, NavTab } from './components/BottomNavBar.tsx';
import { AndroidFrame } from './components/AndroidFrame.tsx';
import { Lead, Activity, GlobalLead, LeadCorrection, PipelineStage, ActivityGpsLocation, ActivitySummarySource, WonDealArchiveRecord } from './types/crm.ts';
import { filterFollowUps, formatNumber } from './utils/crmCalculations.ts';
import { downloadLeadsCsv } from './utils/exportCsv.ts';
import { downloadLocalCrmExport } from './utils/exportJson.ts';
import { SecurityVault } from './utils/securityLock.ts';
import { CheckCircle2 } from 'lucide-react';
import { firebaseTarget, getFirebaseAuth, workspaceId } from './firebase.ts';
import { shouldUseLocalSecurityVault } from './localSecurityPolicy.ts';
import { createActivity, createLead, subscribeToActivities, subscribeToLeads, subscribeToWonDealArchives, updateLeadDetails, updateLeadStage } from './firebaseRepository.ts';
import { createImportedLeadDocumentId, normalizeImportedCompanyName } from './utils/leadImportIdentity.ts';
import { OptimisticLeadStageOverlay, type LeadSnapshotState } from './utils/optimisticLeadStages.ts';
import { firestoreWriteQueue, type SyncQueueSnapshot } from './utils/offlineWriteQueue.ts';
import { reconcileDocumentSyncStatuses } from './utils/syncStatus.ts';
import { canonicalizeModalHistoryState, createAppHistoryState, getModalLeadId, readAppHistoryState, type AppHistoryState, type AppModalName } from './utils/appHistory.ts';
const DashboardView = lazy(() => import('./components/DashboardView.tsx').then(({ DashboardView }) => ({ default: DashboardView })));
const PipelineKanbanView = lazy(() => import('./components/PipelineKanbanView.tsx').then(({ PipelineKanbanView }) => ({ default: PipelineKanbanView })));
const GlobalLeadsView = lazy(() => import('./components/GlobalLeadsView.tsx').then(({ GlobalLeadsView }) => ({ default: GlobalLeadsView })));
const ActivitiesListView = lazy(() => import('./components/ActivitiesListView.tsx').then(({ ActivitiesListView }) => ({ default: ActivitiesListView })));
const AndroidCodeExplorer = lazy(() => import('./components/AndroidCodeExplorer.tsx').then(({ AndroidCodeExplorer }) => ({ default: AndroidCodeExplorer })));
const QuickLeadModal = lazy(() => import('./components/QuickLeadModal.tsx').then(({ QuickLeadModal }) => ({ default: QuickLeadModal })));
const ActivityLoggerModal = lazy(() => import('./components/ActivityLoggerModal.tsx').then(({ ActivityLoggerModal }) => ({ default: ActivityLoggerModal })));
const LeadDetailModal = lazy(() => import('./components/LeadDetailModal.tsx').then(({ LeadDetailModal }) => ({ default: LeadDetailModal })));
const WhatsAppModal = lazy(() => import('./components/WhatsAppModal.tsx').then(({ WhatsAppModal }) => ({ default: WhatsAppModal })));
const SecurityLockScreen = lazy(() => import('./components/SecurityLockScreen.tsx').then(({ SecurityLockScreen }) => ({ default: SecurityLockScreen })));
const SecuritySettingsModal = lazy(() => import('./components/SecuritySettingsModal.tsx').then(({ SecuritySettingsModal }) => ({ default: SecuritySettingsModal })));

const AppChunkFallback = ({ label = 'Memuat tampilan…' }: { label?: string }) => (
  <div className="min-h-64 grid place-items-center text-sm text-[#6b665c]" role="status" aria-live="polite">
    {label}
  </div>
);

const ModalChunkFallback = () => (
  <div className="fixed inset-0 z-[100] grid place-items-center bg-black/20 text-sm font-semibold text-[#1f1f1f]" role="status" aria-live="polite">
    Memuat formulir…
  </div>
);

const APP_TABS: readonly NavTab[] = ['dashboard', 'pipeline', 'leads_finder', 'activities', 'android_code'];

export default function App() {
  const useLocalSecurityVault = shouldUseLocalSecurityVault(firebaseTarget);
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [wonDealArchives, setWonDealArchives] = useState<WonDealArchiveRecord[]>([]);
  const [snapshotReadiness, setSnapshotReadiness] = useState({ leads: false, activities: false, archives: false });
  const [snapshotCacheState, setSnapshotCacheState] = useState({ leads: true, activities: true, archives: true });
  const [globalLeads, setGlobalLeads] = useState<GlobalLead[]>([]);
  const [pendingGlobalLeadNames, setPendingGlobalLeadNames] = useState<Set<string>>(() => new Set());
  const [syncQueueSnapshot, setSyncQueueSnapshot] = useState<SyncQueueSnapshot>(() => firestoreWriteQueue.getSnapshot());
  const [isOnline, setIsOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine);
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(false);

  // Security Vault & Lock State
  const [isAppLocked, setIsAppLocked] = useState<boolean>(() => useLocalSecurityVault && SecurityVault.isCurrentlyLocked());
  const [isSecuritySettingsOpen, setIsSecuritySettingsOpen] = useState(false);

  // Modals
  const [isQuickLeadOpen, setIsQuickLeadOpen] = useState(false);
  const [isActivityLoggerOpen, setIsActivityLoggerOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);
  const [hasOpenedQuickLead, setHasOpenedQuickLead] = useState(false);
  const [hasOpenedActivityLogger, setHasOpenedActivityLogger] = useState(false);
  const [hasOpenedLeadDetail, setHasOpenedLeadDetail] = useState(false);
  const [hasOpenedWhatsApp, setHasOpenedWhatsApp] = useState(false);
  const [hasOpenedSecuritySettings, setHasOpenedSecuritySettings] = useState(false);

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
  const pendingTabChangeRef = useRef<NavTab | null>(null);
  const stageOverlayRef = useRef(new OptimisticLeadStageOverlay());
  const latestFirestoreLeadsRef = useRef<Lead[]>([]);
  const latestFirestoreSnapshotStateRef = useRef<LeadSnapshotState>({ fromCache: true, pendingWriteIds: new Set() });
  const importedGlobalLeadNamesRef = useRef(new Set<string>());

  const renderedLeadsRef = useRef(leads);
  renderedLeadsRef.current = leads;

  // Each app history entry captures both the selected tab and its modal stack.
  const openModalWithHistory = useCallback((openFn: () => void, modalName: AppModalName, leadId?: string) => {
    if (typeof window !== 'undefined') {
      const current = readAppHistoryState(window.history.state, APP_TABS)
        ?? historyEntryRef.current
        ?? createAppHistoryState(currentTabRef.current);
      if (current.modalStack.at(-1) === modalName && getModalLeadId(current, modalName) === (leadId ?? null)) {
        openFn();
        return;
      }
      const ids = current.modalStack.map((_, index) => current.modalLeadIds?.[index] ?? null);
      const next = createAppHistoryState(current.tab, [...current.modalStack, modalName], [...ids, leadId ?? null]);
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
      if (current.modalStack.length > 0) {
        pendingTabChangeRef.current = tab;
        if (!modalBackPendingRef.current) {
          modalBackPendingRef.current = true;
          window.history.go(-current.modalStack.length);
        }
        return;
      }
      const next = createAppHistoryState(tab);
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
      let destination = readAppHistoryState(event.state, APP_TABS);
      modalBackPendingRef.current = false;
      if (!destination) { pendingTabChangeRef.current = null; return; }
      if (pendingTabChangeRef.current) {
        const tab = pendingTabChangeRef.current;
        pendingTabChangeRef.current = null;
        destination = createAppHistoryState(tab);
        window.history.pushState(destination, '');
      }
      const leadMap = new Map(renderedLeadsRef.current.map((lead) => [lead.id, lead]));
      const next = canonicalizeModalHistoryState(destination, new Set(leadMap.keys()));
      if (next.modalStack.length !== destination.modalStack.length) {
        window.history.replaceState(next, '');
        showToast('Dialog ditutup karena konteks Lead tidak tersedia; tab tetap dipertahankan.');
      }
      historyEntryRef.current = next;
      setCurrentTab(next.tab);
      const leadFor = (modalName: AppModalName) => {
        const id = getModalLeadId(next, modalName);
        return id ? leadMap.get(id) ?? null : null;
      };
      // Reconcile both Back and Forward. Lazy modal chunks may not have been
      // opened in this mount yet, so restore their mount flags as well.
      if (next.modalStack.includes('quickLead')) setHasOpenedQuickLead(true);
      if (next.modalStack.includes('activityLogger')) setHasOpenedActivityLogger(true);
      if (next.modalStack.includes('leadDetail')) setHasOpenedLeadDetail(true);
      if (next.modalStack.includes('whatsapp')) setHasOpenedWhatsApp(true);
      if (next.modalStack.includes('securitySettings')) setHasOpenedSecuritySettings(true);
      setIsQuickLeadOpen(next.modalStack.includes('quickLead'));
      setIsActivityLoggerOpen(next.modalStack.includes('activityLogger'));
      setIsSecuritySettingsOpen(next.modalStack.includes('securitySettings'));
      setActivityLead(leadFor('activityLogger'));
      setSelectedLead(leadFor('leadDetail'));
      setWhatsAppLead(leadFor('whatsapp'));
    };

    window.addEventListener('popstate', handlePopState);

    // Auto-lock when resumed from background if timeout expired
    const handleVisibilityChange = () => {
      if (useLocalSecurityVault && document.visibilityState === 'visible') {
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
  }, [showToast, useLocalSecurityVault]);

  // Firebase is the sole source of truth for authenticated CRM records. No
  // localStorage hydration or automatic migration is performed here.
  useEffect(() => {
    const user = getFirebaseAuth().currentUser;
    if (!user) return;
    setGlobalLeads([]);
    setSnapshotReadiness({ leads: false, activities: false, archives: false });
    const onError = (error: Error) => showToast(`Firebase gagal memuat data: ${error.message}`);
    const stopLeads = subscribeToLeads(user.uid, (snapshotLeads, snapshotState) => {
      latestFirestoreLeadsRef.current = snapshotLeads;
      latestFirestoreSnapshotStateRef.current = snapshotState;
      setSnapshotReadiness((current) => ({ ...current, leads: true }));
      setSnapshotCacheState((current) => ({ ...current, leads: snapshotState.fromCache }));
      setLeads(stageOverlayRef.current.reconcile(snapshotLeads, snapshotState));
      const confirmedNames = new Set(snapshotLeads.map((lead) => normalizeImportedCompanyName(lead.company_name)));
      setPendingGlobalLeadNames((current) => {
        const next = new Set([...current].filter((name) => !confirmedNames.has(name)));
        return next.size === current.size ? current : next;
      });
    }, onError);
    const stopActivities = subscribeToActivities(user.uid, (snapshotActivities, fromCache) => {
      setActivities(snapshotActivities);
      setSnapshotReadiness((current) => ({ ...current, activities: true }));
      setSnapshotCacheState((current) => ({ ...current, activities: fromCache }));
    }, onError);
    const stopArchives = subscribeToWonDealArchives(user.uid, (snapshotArchives, fromCache) => {
      setWonDealArchives(snapshotArchives);
      setSnapshotReadiness((current) => ({ ...current, archives: true }));
      setSnapshotCacheState((current) => ({ ...current, archives: fromCache }));
    }, onError);
    return () => { stopLeads(); stopActivities(); stopArchives(); };
  }, [showToast]);

  useEffect(() => firestoreWriteQueue.subscribe((snapshot) => {
    setSyncQueueSnapshot(snapshot);
    const getStatus = (documentId: string) => firestoreWriteQueue.getDocumentSyncStatus(documentId);
    setLeads((current) => reconcileDocumentSyncStatuses(current, getStatus));
    setActivities((current) => reconcileDocumentSyncStatuses(current, getStatus));
  }), []);

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
  const handleSyncNow = async () => {
    if (!isOnline) {
      showToast('Offline — mutasi tertunda tetap tersimpan dan tidak dikirim. Sambungkan kembali untuk memilih sinkronisasi manual.');
      return;
    }
    if (syncQueueSnapshot.manualReplayCount > 0) {
      const expectedCount = syncQueueSnapshot.manualReplayCount;
      const confirmed = window.confirm(
        `Sinkronkan ${formatNumber(expectedCount)} mutasi tertunda dari sesi sebelumnya sekarang? Mutasi akan dikirim ke Firestore; isi prospek dan aktivitas tidak ditampilkan.`,
      );
      if (!confirmed) return;
      const startedCount = firestoreWriteQueue.startManualReplay();
      if (startedCount > 0) {
        showToast(`Sinkronisasi manual dimulai untuk ${formatNumber(startedCount)} mutasi tertunda.`);
      } else {
        showToast('Antrean berubah sebelum sinkronisasi dimulai; tidak ada mutasi yang dikirim.');
      }
      return;
    }
    const retryCount = firestoreWriteQueue.retryFailed();
    if (retryCount > 0) {
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

  // Add Lead
  const handleAddLead = async (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => {
    await createLead(getFirebaseAuth().currentUser!.uid, leadData);
    showToast(`Lead "${leadData.company_name}" menunggu konfirmasi Firestore.`);
  };

  // Update the UI immediately; only revert this operation if its own Firestore write fails.
  const handleUpdateLeadStage = (
    leadId: string,
    newStage: PipelineStage,
    nextFollowupDate?: string
  ) => {
    const previousLead = leads.find((lead) => lead.id === leadId);
    const ownerId = getFirebaseAuth().currentUser?.uid;
    if (!previousLead || !ownerId) {
      showToast('Stage tidak dapat diubah karena lead atau sesi owner tidak tersedia.');
      return;
    }
    const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stageOverlayRef.current.apply(leadId, token, newStage, nextFollowupDate);
    const optimisticFields = {
      pipeline_stage: newStage,
      ...(nextFollowupDate !== undefined ? { next_followup_date: nextFollowupDate } : {}),
      _syncStatus: 'pending_update' as const,
    };
    setLeads((current) => current.map((lead) => lead.id === leadId ? stageOverlayRef.current.overlayLead({ ...lead, ...optimisticFields }) : lead));
    setSelectedLead((current) => current?.id === leadId ? stageOverlayRef.current.overlayLead({ ...current, ...optimisticFields }) : current);

    void (async () => {
      try {
        const receipt = await updateLeadStage(ownerId, leadId, newStage, nextFollowupDate);
        showToast(newStage === 'Closing Won'
          ? 'Closing Won dan arsip transaksi menunggu konfirmasi Firestore.'
          : 'Perubahan stage menunggu konfirmasi Firestore.');
        await receipt.acknowledged;
        stageOverlayRef.current.acknowledge(leadId, token);
        setLeads(stageOverlayRef.current.reconcile(latestFirestoreLeadsRef.current, latestFirestoreSnapshotStateRef.current));
      } catch (error) {
        stageOverlayRef.current.rollback(leadId, token);
        const restoredLeads = stageOverlayRef.current.reconcile(latestFirestoreLeadsRef.current, latestFirestoreSnapshotStateRef.current);
        setLeads(restoredLeads);
        setSelectedLead((current) => current?.id === leadId
          ? restoredLeads.find((lead) => lead.id === leadId) ?? current
          : current);
        const message = error instanceof Error ? error.message : 'Firestore menolak perubahan.';
        showToast(`Stage gagal diubah: ${message}`);
      }
    })();
  };

  const handleUpdateLeadDetails = async (leadId: string, changes: LeadCorrection) => {
    const previousLead = leads.find((lead) => lead.id === leadId);
    const ownerId = getFirebaseAuth().currentUser?.uid;
    if (!previousLead || !ownerId) throw new Error('Lead atau sesi owner tidak tersedia untuk koreksi.');

    const token = `details-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    stageOverlayRef.current.applyDetails(leadId, token, changes);
    setLeads((current) => current.map((lead) => lead.id === leadId ? stageOverlayRef.current.overlayLead(lead) : lead));
    setSelectedLead((current) => current?.id === leadId ? stageOverlayRef.current.overlayLead(current) : current);

    try {
      const receipt = await updateLeadDetails(ownerId, leadId, changes);
      showToast('Koreksi data Lead menunggu konfirmasi Firestore.');
      await receipt.acknowledged;
      stageOverlayRef.current.acknowledge(leadId, token);
      const confirmed = stageOverlayRef.current.reconcile(latestFirestoreLeadsRef.current, latestFirestoreSnapshotStateRef.current);
      setLeads(confirmed);
      setSelectedLead((current) => current?.id === leadId ? confirmed.find((lead) => lead.id === leadId) ?? current : current);
      showToast('Koreksi data Lead berhasil disimpan.');
    } catch (error) {
      stageOverlayRef.current.rollback(leadId, token);
      const restoredLeads = stageOverlayRef.current.reconcile(latestFirestoreLeadsRef.current, latestFirestoreSnapshotStateRef.current);
      setLeads(restoredLeads);
      setSelectedLead((current) => current?.id === leadId
        ? restoredLeads.find((lead) => lead.id === leadId) ?? previousLead
        : current);
      const message = error instanceof Error ? error.message : 'Firestore menolak koreksi data.';
      showToast(`Koreksi Lead gagal: ${message}`);
      throw error;
    }
  };

  // Add Activity / Check-In
  const handleSaveActivity = async (activityData: {
    lead_id: string;
    activity_type: string;
    notes: string;
    ai_summary?: string;
    ai_summary_source?: ActivitySummarySource;
    location_gps?: ActivityGpsLocation;
  }) => {
    try {
      await createActivity(getFirebaseAuth().currentUser!.uid, activityData);
      showToast('Aktivitas menunggu konfirmasi Firestore.');
    } catch (error) {
      showToast(`Aktivitas gagal disimpan: ${(error as Error).message}`);
      throw error;
    }
  };

  // Import Global Lead
  const handleImportGlobalLead = async (globalLead: GlobalLead) => {
    const ownerId = getFirebaseAuth().currentUser?.uid;
    const companyKey = normalizeImportedCompanyName(globalLead.company_name);
    if (!ownerId) throw new Error('Sesi owner tidak tersedia.');
    if (leads.some((lead) => normalizeImportedCompanyName(lead.company_name) === companyKey)
      || importedGlobalLeadNamesRef.current.has(companyKey)) {
      showToast(`"${globalLead.company_name}" sudah ada di CRM atau sedang diimpor.`);
      return;
    }
    importedGlobalLeadNamesRef.current.add(companyKey);
    try {
      const documentId = await createImportedLeadDocumentId(ownerId, workspaceId, globalLead.company_name);
      const receipt = await createLead(ownerId, {
        company_name: globalLead.company_name,
        contact_person: globalLead.contact_person.trim() || 'Belum ditemukan',
        phone: globalLead.phone,
        industry: globalLead.industry,
        city: globalLead.city,
        pipeline_stage: 'Prospect',
        deal_value: Number(globalLead.estimated_value) || 0,
        next_followup_date: '',
        lead_score: 'Unrated',
      }, { documentId });
      setPendingGlobalLeadNames((current) => new Set(current).add(companyKey));
      void receipt.acknowledged.catch(() => {
        importedGlobalLeadNamesRef.current.delete(companyKey);
        setPendingGlobalLeadNames((current) => {
          const next = new Set(current);
          next.delete(companyKey);
          return next;
        });
      });
      showToast(`"${globalLead.company_name}" menunggu konfirmasi Firestore.`);
    } catch (error) {
      importedGlobalLeadNamesRef.current.delete(companyKey);
      showToast(`Lead gagal diimpor: ${(error as Error).message}`);
      throw error;
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

  const handleExportSnapshot = useCallback(() => {
    if (!snapshotReadiness.leads || !snapshotReadiness.activities || !snapshotReadiness.archives) {
      showToast('Tunggu sampai Lead, aktivitas, dan arsip selesai dimuat sebelum mengekspor.');
      return;
    }
    const ownerId = getFirebaseAuth().currentUser?.uid;
    if (!ownerId || !workspaceId) {
      showToast('Ekspor tidak tersedia karena sesi owner atau workspace belum siap.');
      return;
    }
    const confirmed = window.confirm(
      `Ekspor JSON lokal berisi ${formatNumber(leads.length)} Lead, ${formatNumber(activities.length)} aktivitas, dan ${formatNumber(wonDealArchives.length)} arsip Won. File mencakup telepon/kontak, catatan aktivitas, ringkasan AI, dan koordinat GPS bila tersedia. File hanya diunduh ke perangkat ini; ini bukan backup/restore Cloud Firestore. Lanjutkan?`,
    );
    if (!confirmed) return;
    try {
      const filename = downloadLocalCrmExport({
        workspaceId,
        ownerId,
        leads,
        activities,
        wonDealArchives,
        coverage: {
          leads_from_cache: snapshotCacheState.leads,
          activities_from_cache: snapshotCacheState.activities,
          archives_from_cache: snapshotCacheState.archives,
          pending_mutations: syncQueueSnapshot.pendingCount + syncQueueSnapshot.syncingCount,
          failed_mutations: syncQueueSnapshot.failedCount,
        },
      });
      showToast(`Ekspor snapshot lokal diunduh: ${filename}. Periksa status kelengkapan di dalam file.`);
    } catch (error) {
      showToast(`Ekspor snapshot gagal: ${error instanceof Error ? error.message : 'kesalahan tidak diketahui'}`);
    }
  }, [activities, leads, snapshotCacheState, snapshotReadiness, syncQueueSnapshot.failedCount, syncQueueSnapshot.pendingCount, syncQueueSnapshot.syncingCount, showToast, wonDealArchives]);

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

  const openQuickLead = () => {
    setHasOpenedQuickLead(true);
    openModalWithHistory(() => setIsQuickLeadOpen(true), 'quickLead');
  };

  const openActivityLogger = (lead?: Lead) => {
    setActivityLead(lead ?? null);
    setHasOpenedActivityLogger(true);
    openModalWithHistory(() => setIsActivityLoggerOpen(true), 'activityLogger', lead?.id);
  };

  const openLeadDetail = (lead: Lead) => {
    setHasOpenedLeadDetail(true);
    openModalWithHistory(() => setSelectedLead(lead), 'leadDetail', lead.id);
  };

  const openWhatsApp = (lead: Lead) => {
    setHasOpenedWhatsApp(true);
    setWhatsAppLead(lead);
    openModalWithHistory(() => setWhatsAppLead(lead), 'whatsapp', lead.id);
  };

  const openSecuritySettings = () => {
    setHasOpenedSecuritySettings(true);
    openModalWithHistory(() => setIsSecuritySettingsOpen(true), 'securitySettings');
  };

  return (
    <AndroidFrame isPhoneFrame={isPhoneFrame} isOnline={isOnline}>
      <div className={`flex-1 flex flex-col bg-[#fcfcfa] ${isPhoneFrame ? 'h-full min-h-0' : 'min-h-dvh'}`}>
        {/* Top App Bar with Security Lock & CSV Export */}
        <TopAppBar
          title={getTabTitle()}
          isOnline={isOnline}
          pendingCount={pendingCount}
          failedCount={syncQueueSnapshot.failedCount}
          acknowledgedCount={syncQueueSnapshot.acknowledgedCount}
          manualReplayCount={syncQueueSnapshot.manualReplayCount}
          isSyncing={isSyncing}
          onSyncNow={handleSyncNow}
          syncOperations={syncQueueSnapshot.operations}
          onRetrySyncOperation={handleRetrySyncOperation}
          isPhoneFrame={isPhoneFrame}
          onTogglePhoneFrame={() => setIsPhoneFrame(!isPhoneFrame)}
          isAndroidCodeActive={currentTab === 'android_code'}
          onToggleAndroidCode={() =>
            currentTab === 'android_code' ? window.history.back() : changeTabWithHistory('android_code')
          }
          onOpenSecurity={useLocalSecurityVault ? openSecuritySettings : undefined}
          isSecurityActive={useLocalSecurityVault && SecurityVault.isSecurityEnabled()}
          onExportCsv={handleExportCsv}
          onExportSnapshot={handleExportSnapshot}
        />

        {/* Main Content Area */}
        <main className={`flex-1 p-3.5 sm:p-6 max-w-7xl w-full mx-auto ${isPhoneFrame ? 'min-h-0 overflow-y-auto' : ''}`}>
          {currentTab === 'dashboard' && (
            <Suspense fallback={<AppChunkFallback />}>
              <DashboardView
                leads={leads}
                activities={activities}
                onOpenQuickLead={openQuickLead}
                onOpenActivityLogger={openActivityLogger}
                onSelectLead={openLeadDetail}
                onOpenWhatsApp={openWhatsApp}
                onNavigateToPipeline={() => changeTabWithHistory('pipeline')}
                onNavigateToFinder={() => changeTabWithHistory('leads_finder')}
                onExportCsv={handleExportCsv}
              />
            </Suspense>
          )}

          {currentTab === 'pipeline' && (
            <Suspense fallback={<AppChunkFallback />}>
              <PipelineKanbanView
                leads={leads}
                onUpdateLeadStage={handleUpdateLeadStage}
                onSelectLead={openLeadDetail}
                onOpenQuickLead={openQuickLead}
                onOpenWhatsApp={openWhatsApp}
                onExportCsv={handleExportCsv}
              />
            </Suspense>
          )}

          {currentTab === 'leads_finder' && (
            <Suspense fallback={<AppChunkFallback />}>
              <GlobalLeadsView
                personalLeads={leads}
                globalLeads={globalLeads}
                pendingImportedCompanyNames={pendingGlobalLeadNames}
                aiSearchEnabled={import.meta.env.VITE_AI_LEAD_FINDER_ENABLED === 'true'}
                onImportGlobalLead={handleImportGlobalLead}
                onNavigateToPipeline={() => changeTabWithHistory('pipeline')}
              />
            </Suspense>
          )}

          {currentTab === 'activities' && (
            <Suspense fallback={<AppChunkFallback />}>
              <ActivitiesListView
                activities={activities}
                leads={leads}
                onOpenActivityLogger={openActivityLogger}
                onSelectLead={openLeadDetail}
              />
            </Suspense>
          )}

          {currentTab === 'android_code' && (
            <Suspense fallback={<AppChunkFallback />}>
              <AndroidCodeExplorer />
            </Suspense>
          )}
        </main>

        {/* Android Material 3 Bottom Navigation Bar */}
        <BottomNavBar
          currentTab={currentTab}
          onSelectTab={changeTabWithHistory}
          followUpDueCount={dueCount}
        />

        {/* Android Snackbar Toast Notification: 8px radius, ink background, Sprout Orange icon */}
        {toastMessage && (
          <div role="status" style={{ maxWidth: isPhoneFrame ? 352 : 448 }} className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] left-1/2 -translate-x-1/2 z-50 bg-[#1f1f1f] text-[#fcfcfa] text-xs font-semibold px-4 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-start gap-2.5 w-[calc(100%-2rem)] max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-[#ff4800] shrink-0" />
            <span className="min-w-0 break-words">{toastMessage}</span>
          </div>
        )}

        {/* MODALS WITH MOBILE BACK GESTURE INTEGRATION */}
        {hasOpenedQuickLead && (
          <Suspense fallback={<ModalChunkFallback />}>
            <QuickLeadModal
              isOpen={isQuickLeadOpen}
              onClose={() => closeModalWithHistory('quickLead', () => setIsQuickLeadOpen(false))}
              onAddLead={handleAddLead}
            />
          </Suspense>
        )}

        {hasOpenedActivityLogger && (
          <Suspense fallback={<ModalChunkFallback />}>
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
              aiSummarizerEnabled={import.meta.env.VITE_AI_MEETING_SUMMARIZER_ENABLED === 'true'}
              onSaveActivity={handleSaveActivity}
            />
          </Suspense>
        )}

        {hasOpenedLeadDetail && (
          <Suspense fallback={<ModalChunkFallback />}>
            <LeadDetailModal
              isOpen={!!selectedLead}
              onClose={() => closeModalWithHistory('leadDetail', () => setSelectedLead(null))}
              lead={selectedLead}
              activities={activities}
              onUpdateStage={handleUpdateLeadStage}
              onUpdateLeadDetails={handleUpdateLeadDetails}
              onOpenActivityLogger={openActivityLogger}
              onOpenWhatsApp={openWhatsApp}
            />
          </Suspense>
        )}

        {hasOpenedWhatsApp && (
          <Suspense fallback={<ModalChunkFallback />}>
            <WhatsAppModal
              isOpen={!!whatsAppLead}
              onClose={() => closeModalWithHistory('whatsapp', () => setWhatsAppLead(null))}
              lead={whatsAppLead}
            />
          </Suspense>
        )}

        {useLocalSecurityVault && (
          hasOpenedSecuritySettings && (
            <Suspense fallback={<ModalChunkFallback />}>
              <SecuritySettingsModal
                isOpen={isSecuritySettingsOpen}
                onClose={() => closeModalWithHistory('securitySettings', () => setIsSecuritySettingsOpen(false))}
                onLockNow={() => {
                  closeModalWithHistory('securitySettings', () => setIsSecuritySettingsOpen(false));
                  SecurityVault.lockNow();
                  setIsAppLocked(true);
                }}
              />
            </Suspense>
          )
        )}

        {/* Local Security Shield Fullscreen Lock Overlay */}
        {useLocalSecurityVault && isAppLocked && (
          <Suspense fallback={<ModalChunkFallback />}>
            <SecurityLockScreen
              onUnlocked={() => {
                SecurityVault.recordUnlock();
                setIsAppLocked(false);
              }}
            />
          </Suspense>
        )}
      </div>
    </AndroidFrame>
  );
}
