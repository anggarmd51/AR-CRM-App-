import { Lead, Activity, GlobalLead, QueuedMutation, PipelineStage, WonDealArchiveRecord } from '../types/crm.ts';
import { toDateStringOnly } from './crmCalculations.ts';

const STORAGE_KEY_LEADS = 'personal_crm_leads_v2';
const STORAGE_KEY_ACTIVITIES = 'personal_crm_activities_v2';
const STORAGE_KEY_GLOBAL_LEADS = 'personal_crm_global_leads_v2';
const STORAGE_KEY_QUEUE = 'personal_crm_mutations_queue_v2';
const STORAGE_KEY_ARCHIVES = 'personal_crm_won_archives_v2';
const STORAGE_KEY_SIMULATE_OFFLINE = 'personal_crm_simulate_offline';


// Legacy mock ID signatures to permanently purge from user storage
const LEGACY_MOCK_LEAD_IDS = new Set(['LEAD-101', 'LEAD-102', 'LEAD-103', 'LEAD-104']);
const LEGACY_MOCK_ACTIVITY_IDS = new Set(['ACT-201', 'ACT-202']);
const LEGACY_MOCK_GLOBAL_IDS = new Set(['GL-1', 'GL-2', 'GL-3', 'GL-4', 'GL-5']);
const LEGACY_DUMMY_NAMES = new Set([
  'pt nusantara logistics',
  'cv makmur sentosa',
  'pt digital solusi utama',
  'karya prima medika',
]);

function isLegacyDummyLead(lead: Lead): boolean {
  if (!lead || !lead.id) return false;
  if (LEGACY_MOCK_LEAD_IDS.has(lead.id)) return true;
  if (lead.company_name && LEGACY_DUMMY_NAMES.has(lead.company_name.toLowerCase().trim())) return true;
  return false;
}

function isLegacyDummyActivity(act: Activity): boolean {
  if (!act || !act.id) return false;
  if (LEGACY_MOCK_ACTIVITY_IDS.has(act.id)) return true;
  if (act.lead_id && LEGACY_MOCK_LEAD_IDS.has(act.lead_id)) return true;
  return false;
}

function isLegacyDummyGlobalLead(gl: GlobalLead): boolean {
  if (!gl || !gl.id) return false;
  if (LEGACY_MOCK_GLOBAL_IDS.has(gl.id)) return true;
  return false;
}

// Safe Storage Helper
function getStoredItem<T>(key: string, defaultValue: T): T {
  if (typeof localStorage === 'undefined') return defaultValue;
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (e) {
    console.warn(`Error reading localStorage key "${key}":`, e);
    return defaultValue;
  }
}

function setStoredItem<T>(key: string, value: T): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn(`Error writing localStorage key "${key}":`, e);
  }
}

export const CrmStorage = {
  getLeads(): Lead[] {
    const stored = getStoredItem<Lead[]>(STORAGE_KEY_LEADS, []);
    const cleaned = stored.filter((l) => !isLegacyDummyLead(l));
    if (cleaned.length !== stored.length) {
      setStoredItem(STORAGE_KEY_LEADS, cleaned);
    }
    return cleaned;
  },

  setLeads(leads: Lead[]): void {
    setStoredItem(STORAGE_KEY_LEADS, leads.filter((l) => !isLegacyDummyLead(l)));
  },

  getActivities(): Activity[] {
    const stored = getStoredItem<Activity[]>(STORAGE_KEY_ACTIVITIES, []);
    const cleaned = stored.filter((a) => !isLegacyDummyActivity(a));
    if (cleaned.length !== stored.length) {
      setStoredItem(STORAGE_KEY_ACTIVITIES, cleaned);
    }
    return cleaned;
  },

  setActivities(activities: Activity[]): void {
    setStoredItem(STORAGE_KEY_ACTIVITIES, activities.filter((a) => !isLegacyDummyActivity(a)));
  },

  getGlobalLeads(): GlobalLead[] {
    const stored = getStoredItem<GlobalLead[]>(STORAGE_KEY_GLOBAL_LEADS, []);
    const cleaned = stored.filter((gl) => !isLegacyDummyGlobalLead(gl));
    if (cleaned.length !== stored.length) {
      setStoredItem(STORAGE_KEY_GLOBAL_LEADS, cleaned);
    }
    return cleaned;
  },

  setGlobalLeads(leads: GlobalLead[]): void {
    setStoredItem(STORAGE_KEY_GLOBAL_LEADS, leads.filter((gl) => !isLegacyDummyGlobalLead(gl)));
  },

  getQueue(): QueuedMutation[] {
    return getStoredItem<QueuedMutation[]>(STORAGE_KEY_QUEUE, []);
  },

  setQueue(queue: QueuedMutation[]): void {
    setStoredItem(STORAGE_KEY_QUEUE, queue);
  },

  getWonArchives(): WonDealArchiveRecord[] {
    return getStoredItem<WonDealArchiveRecord[]>(STORAGE_KEY_ARCHIVES, []);
  },

  setWonArchives(archives: WonDealArchiveRecord[]): void {
    setStoredItem(STORAGE_KEY_ARCHIVES, archives);
  },

  isSimulatedOffline(): boolean {
    return getStoredItem<boolean>(STORAGE_KEY_SIMULATE_OFFLINE, false);
  },

  setSimulatedOffline(status: boolean): void {
    setStoredItem(STORAGE_KEY_SIMULATE_OFFLINE, status);
  },

  clearAll(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(STORAGE_KEY_LEADS);
      localStorage.removeItem(STORAGE_KEY_ACTIVITIES);
      localStorage.removeItem(STORAGE_KEY_GLOBAL_LEADS);
      localStorage.removeItem(STORAGE_KEY_QUEUE);
      localStorage.removeItem(STORAGE_KEY_ARCHIVES);
    }
  },
};

/**
 * Queue management and synchronization engine.
 */
export class CrmSyncEngine {
  private isSyncing = false;
  private onStatusChangeListeners: Array<(pendingCount: number, isSyncing: boolean) => void> = [];

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.processQueue();
      });
    }
  }

  public subscribe(listener: (pendingCount: number, isSyncing: boolean) => void) {
    this.onStatusChangeListeners.push(listener);
    listener(this.getPendingCount(), this.isSyncing);
    return () => {
      this.onStatusChangeListeners = this.onStatusChangeListeners.filter((l) => l !== listener);
    };
  }

  private notify() {
    const count = this.getPendingCount();
    for (const listener of this.onStatusChangeListeners) {
      listener(count, this.isSyncing);
    }
  }

  public isOnline(): boolean {
    if (CrmStorage.isSimulatedOffline()) return false;
    if (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean') {
      return navigator.onLine;
    }
    return true;
  }

  public getPendingCount(): number {
    return CrmStorage.getQueue().filter((m) => m.status === 'pending' || m.status === 'syncing').length;
  }

  /**
   * Adds a Lead to local browser storage and records it as pending for a future authenticated backend.
   */
  public enqueueAddLead(
    leadData: Omit<Lead, 'id' | '_syncStatus' | 'created_at' | 'updated_at'>
  ): Lead {
    const tempId = `TEMP-LEAD-${Date.now()}`;
    const newLead: Lead = {
      ...leadData,
      id: tempId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      _syncStatus: 'pending_insert',
    };

    // Save locally
    const leads = [newLead, ...CrmStorage.getLeads()];
    CrmStorage.setLeads(leads);

    // Queue mutation
    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'addLead',
      payload: {
        tempId,
        company_name: leadData.company_name,
        contact_person: leadData.contact_person,
        phone: String(leadData.phone || ''),
        industry: leadData.industry,
        city: leadData.city,
        pipeline_stage: leadData.pipeline_stage,
        deal_value: Number(leadData.deal_value) || 0,
        next_followup_date: leadData.next_followup_date || '',
        lead_score: leadData.lead_score,
      },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const queue = [...CrmStorage.getQueue(), mutation];
    CrmStorage.setQueue(queue);
    this.notify();

    // Trigger sync attempt
    if (this.isOnline()) {
      this.processQueue();
    }

    return newLead;
  }

  /**
   * Optimistically updates a lead's stage and next followup date.
   */
  public enqueueUpdateLeadStage(
    leadId: string,
    newStage: PipelineStage,
    nextFollowupDate?: string
  ): void {
    const leads = CrmStorage.getLeads().map((l) => {
      if (l.id === leadId) {
        return {
          ...l,
          pipeline_stage: newStage,
          next_followup_date: nextFollowupDate !== undefined ? nextFollowupDate : l.next_followup_date,
          updated_at: new Date().toISOString(),
          _syncStatus: 'pending_update' as const,
        };
      }
      return l;
    });
    CrmStorage.setLeads(leads);

    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'updateLeadStage',
      payload: {
        id: leadId,
        pipeline_stage: newStage,
        next_followup_date: nextFollowupDate || '',
      },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const queue = [...CrmStorage.getQueue(), mutation];
    CrmStorage.setQueue(queue);
    this.notify();

    // Auto-archive deal to separate Archive_Logs sheet if moved to Closing Won
    if (newStage === 'Closing Won') {
      const updatedLead = leads.find((l) => l.id === leadId);
      if (updatedLead) {
        this.enqueueArchiveClosingWon(updatedLead);
      }
    }

    if (this.isOnline()) {
      this.processQueue();
    }
  }

  /**
   * Automatically queues an archive entry to Archive_Logs sheet for won deals.
   */
  public enqueueArchiveClosingWon(lead: Lead): void {
    const archiveRecord: WonDealArchiveRecord = {
      id: `ARCHIVE-${Date.now()}`,
      lead_id: lead.id,
      company_name: lead.company_name,
      contact_person: lead.contact_person,
      phone: String(lead.phone || ''),
      deal_value: Number(lead.deal_value) || 0,
      industry: lead.industry,
      city: lead.city,
      won_date: toDateStringOnly(new Date())!,
      archived_at: new Date().toISOString(),
    };

    const currentArchives = CrmStorage.getWonArchives();
    CrmStorage.setWonArchives([archiveRecord, ...currentArchives]);

    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'archiveClosingWon',
      payload: archiveRecord,
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const queue = [...CrmStorage.getQueue(), mutation];
    CrmStorage.setQueue(queue);
    this.notify();

    if (this.isOnline()) {
      this.processQueue();
    }
  }

  /** Optimistically logs a notes-only activity and queues sync for legacy callers. */
  public enqueueAddActivity(
    activityData: Omit<Activity, 'id' | '_syncStatus' | 'created_at'>
  ): Activity {
    const tempId = `TEMP-ACT-${Date.now()}`;
    const newActivity: Activity = {
      lead_id: activityData.lead_id,
      activity_type: activityData.activity_type,
      notes: activityData.notes,
      id: tempId,
      created_at: new Date().toISOString(),
      _syncStatus: 'pending_insert',
    };

    const activities = [newActivity, ...CrmStorage.getActivities()];
    CrmStorage.setActivities(activities);

    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'addActivity',
      payload: {
        tempId,
        lead_id: activityData.lead_id,
        activity_type: activityData.activity_type,
        notes: activityData.notes,
      },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const queue = [...CrmStorage.getQueue(), mutation];
    CrmStorage.setQueue(queue);
    this.notify();

    if (this.isOnline()) {
      this.processQueue();
    }

    return newActivity;
  }

  /**
   * Imports a global lead into personal CRM.
   */
  public enqueueImportGlobalLead(globalLead: GlobalLead): Lead {
    const tempId = `TEMP-LEAD-IMP-${Date.now()}`;
    const newLead: Lead = {
      id: tempId,
      company_name: globalLead.company_name,
      contact_person: globalLead.contact_person,
      phone: globalLead.phone,
      industry: globalLead.industry,
      city: globalLead.city,
      pipeline_stage: 'Prospect',
      deal_value: Number(globalLead.estimated_value) > 0 ? Number(globalLead.estimated_value) : 0,
      next_followup_date: '',
      lead_score: 'Unrated',
      created_at: new Date().toISOString(),
      _syncStatus: 'pending_insert',
    };

    const leads = [newLead, ...CrmStorage.getLeads()];
    CrmStorage.setLeads(leads);

    const mutation: QueuedMutation = {
      id: `mut-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      action: 'importGlobalLead',
      payload: {
        tempId,
        company_name: globalLead.company_name,
        contact_person: globalLead.contact_person,
        phone: globalLead.phone,
        industry: globalLead.industry,
        city: globalLead.city,
      },
      timestamp: Date.now(),
      retries: 0,
      status: 'pending',
    };

    const queue = [...CrmStorage.getQueue(), mutation];
    CrmStorage.setQueue(queue);
    this.notify();

    if (this.isOnline()) {
      this.processQueue();
    }

    return newLead;
  }

  /**
   * Legacy GAS transport has been removed. Queue entries remain local and are
   * not considered synchronized until an authenticated Firebase repository is wired.
   */
  public async processQueue(): Promise<{ processed: number; failed: number }> {
    return { processed: 0, failed: 0 };
  }

  /**
   * No remote read is performed during the Firebase migration. Return the local
   * counts only so existing screens can render without claiming a cloud refresh.
   */
  public async pullRemoteData(): Promise<{ leadsCount: number; activitiesCount: number; globalLeadsCount: number }> {
    return {
      leadsCount: CrmStorage.getLeads().length,
      activitiesCount: CrmStorage.getActivities().length,
      globalLeadsCount: CrmStorage.getGlobalLeads().length,
    };
  }
}

export const syncEngine = new CrmSyncEngine();

export { OfflineWriteQueue, firestoreWriteQueue } from './offlineWriteQueue.ts';
export type { QueueWriteReceipt, SyncOperationState, SyncQueueOperation, SyncQueueSnapshot } from './offlineWriteQueue.ts';
