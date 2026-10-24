/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
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
import { AndroidFrame } from './components/AndroidFrame.tsx';
import { Lead, Activity, GlobalLead, PipelineStage } from './types/crm.ts';
import { CrmStorage, syncEngine } from './utils/syncQueue.ts';
import { filterFollowUps } from './utils/crmCalculations.ts';
import { CheckCircle2 } from 'lucide-react';

export default function App() {
  const [currentTab, setCurrentTab] = useState<NavTab>('dashboard');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState<boolean>(false);
  const [isPhoneFrame, setIsPhoneFrame] = useState<boolean>(false);

  // Modals
  const [isQuickLeadOpen, setIsQuickLeadOpen] = useState(false);
  const [isActivityLoggerOpen, setIsActivityLoggerOpen] = useState(false);
  const [activityLead, setActivityLead] = useState<Lead | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [whatsAppLead, setWhatsAppLead] = useState<Lead | null>(null);

  // Snackbar Toast
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Load state from local storage & subscribe to sync engine
  const refreshLocalData = useCallback(() => {
    setLeads(CrmStorage.getLeads());
    setActivities(CrmStorage.getActivities());
    setPendingCount(syncEngine.getPendingCount());
    setIsSimulatedOffline(CrmStorage.isSimulatedOffline());
  }, []);

  useEffect(() => {
    refreshLocalData();

    // Subscribe to queue changes
    const unsubscribe = syncEngine.subscribe((count, syncing) => {
      setPendingCount(count);
      setIsSyncing(syncing);
      // Reload leads and activities when queue changes
      setLeads(CrmStorage.getLeads());
      setActivities(CrmStorage.getActivities());
    });

    // Auto pull remote Cloud Database data on initial load
    syncEngine.pullRemoteData().then(() => {
      refreshLocalData();
    });

    return () => {
      unsubscribe();
    };
  }, [refreshLocalData]);

  // Actions
  const handleToggleSimulatedOffline = () => {
    const next = !isSimulatedOffline;
    CrmStorage.setSimulatedOffline(next);
    setIsSimulatedOffline(next);
    if (!next) {
      showToast('Connection restored: Flushing offline sync queue...');
      syncEngine.processQueue().then((res) => {
        if (res.processed > 0) {
          showToast(`Synced ${res.processed} pending operation(s) to Cloud Database!`);
        }
        refreshLocalData();
      });
    } else {
      showToast('Offline Mode enabled. Operations will queue locally.');
    }
  };

  const handleSyncNow = async () => {
    if (!syncEngine.isOnline()) {
      showToast('App is currently offline. Disable offline mode to sync.');
      return;
    }
    showToast('Syncing with Cloud Database...');
    const queueResult = await syncEngine.processQueue();
    await syncEngine.pullRemoteData();
    refreshLocalData();
    showToast(
      queueResult.processed > 0
        ? `Sync complete! Synced ${queueResult.processed} action(s).`
        : 'Up to date with Cloud Database!'
    );
  };

  // Add Lead
  const handleAddLead = (leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>) => {
    const newLead = syncEngine.enqueueAddLead(leadData);
    refreshLocalData();
    showToast(
      syncEngine.isOnline()
        ? `Lead "${newLead.company_name}" added and syncing to Cloud Database!`
        : `Lead "${newLead.company_name}" saved to local offline cache.`
    );
  };

  // Update Lead Stage
  const handleUpdateLeadStage = (
    leadId: string,
    newStage: PipelineStage,
    nextFollowupDate?: string
  ) => {
    syncEngine.enqueueUpdateLeadStage(leadId, newStage, nextFollowupDate);
    refreshLocalData();
    if (selectedLead && selectedLead.id === leadId) {
      setSelectedLead((prev) => (prev ? { ...prev, pipeline_stage: newStage } : null));
    }
    showToast(
      syncEngine.isOnline()
        ? `Stage updated to ${newStage} (Syncing to Cloud Database...)`
        : `Stage updated to ${newStage} (Saved locally)`
    );
  };

  // Add Activity / Check-In
  const handleSaveActivity = async (activityData: {
    lead_id: string;
    activity_type: string;
    notes: string;
    ai_summary: string;
    location_gps: string;
  }) => {
    syncEngine.enqueueAddActivity(activityData);
    refreshLocalData();
    showToast(
      syncEngine.isOnline()
        ? 'GPS Check-in recorded and syncing to Cloud Database!'
        : 'GPS Check-in recorded to local offline storage.'
    );
  };

  // Import Global Lead
  const handleImportGlobalLead = (globalLead: GlobalLead) => {
    syncEngine.enqueueImportGlobalLead(globalLead);
    refreshLocalData();
    showToast(`Imported "${globalLead.company_name}" into AR CRM sales pipeline!`);
  };

  const followUpMetrics = filterFollowUps(leads);
  const dueCount = followUpMetrics.dueToday.length + followUpMetrics.overdue.length;
  const isOnline = syncEngine.isOnline();

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
        {/* Top App Bar */}
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
            setCurrentTab((prev) => (prev === 'android_code' ? 'dashboard' : 'android_code'))
          }
        />

        {/* Main Content Area */}
        <main className="flex-1 p-3.5 sm:p-6 max-w-7xl w-full mx-auto">
          {currentTab === 'dashboard' && (
            <DashboardView
              leads={leads}
              activities={activities}
              onOpenQuickLead={() => setIsQuickLeadOpen(true)}
              onOpenActivityLogger={(lead) => {
                setActivityLead(lead || null);
                setIsActivityLoggerOpen(true);
              }}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onOpenWhatsApp={(lead) => setWhatsAppLead(lead)}
              onNavigateToPipeline={() => setCurrentTab('pipeline')}
              onNavigateToFinder={() => setCurrentTab('leads_finder')}
            />
          )}

          {currentTab === 'pipeline' && (
            <PipelineKanbanView
              leads={leads}
              onUpdateLeadStage={handleUpdateLeadStage}
              onSelectLead={(lead) => setSelectedLead(lead)}
              onOpenQuickLead={() => setIsQuickLeadOpen(true)}
              onOpenWhatsApp={(lead) => setWhatsAppLead(lead)}
            />
          )}

          {currentTab === 'leads_finder' && (
            <GlobalLeadsView
              personalLeads={leads}
              onImportGlobalLead={handleImportGlobalLead}
              onNavigateToPipeline={() => setCurrentTab('pipeline')}
            />
          )}

          {currentTab === 'activities' && (
            <ActivitiesListView
              activities={activities}
              leads={leads}
              onOpenActivityLogger={(lead) => {
                setActivityLead(lead || null);
                setIsActivityLoggerOpen(true);
              }}
              onSelectLead={(lead) => setSelectedLead(lead)}
            />
          )}

          {currentTab === 'android_code' && <AndroidCodeExplorer />}
        </main>

        {/* Android Material 3 Bottom Navigation Bar */}
        <BottomNavBar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          followUpDueCount={dueCount}
        />

        {/* Android Snackbar Toast Notification: 8px radius, ink background, Sprout Orange icon */}
        {toastMessage && (
          <div className="fixed bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 z-50 bg-[#1f1f1f] text-[#fcfcfa] text-xs font-semibold px-4 py-2.5 rounded-[8px] border border-[#1f1f1f] flex items-center gap-2.5 max-w-md animate-in fade-in slide-in-from-bottom-2 duration-150">
            <CheckCircle2 className="w-4 h-4 text-[#ff4800] shrink-0" />
            <span className="truncate">{toastMessage}</span>
          </div>
        )}

        {/* MODALS */}
        <QuickLeadModal
          isOpen={isQuickLeadOpen}
          onClose={() => setIsQuickLeadOpen(false)}
          onAddLead={handleAddLead}
        />

        <ActivityLoggerModal
          isOpen={isActivityLoggerOpen}
          onClose={() => {
            setIsActivityLoggerOpen(false);
            setActivityLead(null);
          }}
          leads={leads}
          initialLead={activityLead}
          onSaveActivity={handleSaveActivity}
        />

        <LeadDetailModal
          isOpen={!!selectedLead}
          onClose={() => setSelectedLead(null)}
          lead={selectedLead}
          activities={activities}
          onUpdateStage={handleUpdateLeadStage}
          onOpenActivityLogger={(l) => {
            setActivityLead(l);
            setIsActivityLoggerOpen(true);
          }}
          onOpenWhatsApp={(l) => setWhatsAppLead(l)}
        />

        <WhatsAppModal
          isOpen={!!whatsAppLead}
          onClose={() => setWhatsAppLead(null)}
          lead={whatsAppLead}
        />
      </div>
    </AndroidFrame>
  );
}
