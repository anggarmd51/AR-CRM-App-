import { Lead, Activity, GlobalLead, QueuedMutation, PipelineStage } from '../types/crm.ts';

const STORAGE_KEY_LEADS = 'personal_crm_leads_v2';
const STORAGE_KEY_ACTIVITIES = 'personal_crm_activities_v2';
const STORAGE_KEY_QUEUE = 'personal_crm_mutations_queue_v2';
const STORAGE_KEY_SIMULATE_OFFLINE = 'personal_crm_simulate_offline';

// Default initial seed data if fresh storage
export const SEED_LEADS: Lead[] = [
  {
    id: 'LEAD-101',
    company_name: 'PT Nusantara Logistics',
    contact_person: 'Budi Santoso',
    phone: '+6281234567890',
    industry: 'Logistics & Supply Chain',
    city: 'Jakarta',
    pipeline_stage: 'Meeting',
    deal_value: 45000000,
    next_followup_date: new Date().toISOString().slice(0, 10), // Today
    lead_score: 'Hot',
    created_at: new Date(Date.now() - 86400000 * 2).toISOString(),
    _syncStatus: 'synced',
  },
  {
    id: 'LEAD-102',
    company_name: 'CV Makmur Sentosa',
    contact_person: 'Dewi Lestari',
    phone: '+6281987654321',
    industry: 'Manufacturing',
    city: 'Surabaya',
    pipeline_stage: 'Negotiation',
    deal_value: 85000000,
    next_followup_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
    lead_score: 'Hot',
    created_at: new Date(Date.now() - 86400000 * 5).toISOString(),
    _syncStatus: 'synced',
  },
  {
    id: 'LEAD-103',
    company_name: 'PT Digital Solusi Utama',
    contact_person: 'Rian Pratama',
    phone: '+6285211223344',
    industry: 'Information Technology',
    city: 'Bandung',
    pipeline_stage: 'Prospect',
    deal_value: 30000000,
    next_followup_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10), // Overdue
    lead_score: 'Warm',
    created_at: new Date(Date.now() - 86400000 * 7).toISOString(),
    _syncStatus: 'synced',
  },
  {
    id: 'LEAD-104',
    company_name: 'Karya Prima Medika',
    contact_person: 'dr. Hendra Kusuma',
    phone: '+6287733445566',
    industry: 'Healthcare & Pharma',
    city: 'Semarang',
    pipeline_stage: 'Closing Won',
    deal_value: 120000000,
    next_followup_date: '',
    lead_score: 'Hot',
    created_at: new Date(Date.now() - 86400000 * 12).toISOString(),
    _syncStatus: 'synced',
  },
];

export const SEED_ACTIVITIES: Activity[] = [
  {
    id: 'ACT-201',
    lead_id: 'LEAD-101',
    activity_type: 'Meeting Check-In',
    notes: 'In-person meeting at client headquarters in Kuningan. Demonstrated fleet tracking dashboard.',
    ai_summary: '• Demonstrated telematics dashboard to VP Ops.\n• Key interest: driver safety reports.\n• Next step: Send pilot contract terms by tomorrow.',
    location_gps: '-6.2231, 106.8291',
    created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
    _syncStatus: 'synced',
  },
  {
    id: 'ACT-202',
    lead_id: 'LEAD-102',
    activity_type: 'Negotiation Call',
    notes: 'Discussed annual payment discounts. Offered 7% discount on 2-year commitment.',
    ai_summary: '• Commercial terms reviewed with finance director.\n• 7% multi-year discount approved.\n• Next step: Issue revised formal PO.',
    location_gps: '-7.2575, 112.7521',
    created_at: new Date(Date.now() - 3600000 * 28).toISOString(),
    _syncStatus: 'synced',
  },
];

// Curated high-potential global leads database for Lead Finder
export const GLOBAL_LEADS_CATALOG: GlobalLead[] = [
  {
    id: 'GL-1',
    company_name: 'Garuda Cold Chain Logistics',
    contact_person: 'Bambang Soedjarwo',
    phone: '+6281290011223',
    industry: 'Cold Storage & Logistics',
    city: 'Jakarta',
    estimated_value: 95000000,
    tags: ['High Growth', 'Logistics 4.0'],
  },
  {
    id: 'GL-2',
    company_name: 'Artha Agro Mandiri',
    contact_person: 'Maya Wulandari',
    phone: '+6281312345678',
    industry: 'Agriculture & Exports',
    city: 'Medan',
    estimated_value: 65000000,
    tags: ['Export Ready', 'B2B Supplies'],
  },
  {
    id: 'GL-3',
    company_name: 'Sinergi Finansial Asia',
    contact_person: 'Fajar Nugraha',
    phone: '+6285678901234',
    industry: 'Fintech & Payments',
    city: 'Jakarta',
    estimated_value: 140000000,
    tags: ['Enterprise Deal', 'Fintech'],
  },
  {
    id: 'GL-4',
    company_name: 'Surya Baja Konstruksi',
    contact_person: 'Ir. Agus Wijaya',
    phone: '+6281898765432',
    industry: 'Construction & Steel',
    city: 'Surabaya',
    estimated_value: 110000000,
    tags: ['Infrastructure', 'High Value'],
  },
  {
    id: 'GL-5',
    company_name: 'Prima Meditech Farma',
    contact_person: 'Ratna Sari',
    phone: '+6287812398765',
    industry: 'Medical Devices',
    city: 'Bandung',
    estimated_value: 50000000,
    tags: ['Healthcare', 'Reliable'],
  },
];

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
    if (!stored || stored.length === 0) {
      setStoredItem(STORAGE_KEY_LEADS, SEED_LEADS);
      return SEED_LEADS;
    }
    return stored;
  },

  setLeads(leads: Lead[]): void {
    setStoredItem(STORAGE_KEY_LEADS, leads);
  },

  getActivities(): Activity[] {
    const stored = getStoredItem<Activity[]>(STORAGE_KEY_ACTIVITIES, []);
    if (!stored || stored.length === 0) {
      setStoredItem(STORAGE_KEY_ACTIVITIES, SEED_ACTIVITIES);
      return SEED_ACTIVITIES;
    }
    return stored;
  },

  setActivities(activities: Activity[]): void {
    setStoredItem(STORAGE_KEY_ACTIVITIES, activities);
  },

  getQueue(): QueuedMutation[] {
    return getStoredItem<QueuedMutation[]>(STORAGE_KEY_QUEUE, []);
  },

  setQueue(queue: QueuedMutation[]): void {
    setStoredItem(STORAGE_KEY_QUEUE, queue);
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
      localStorage.removeItem(STORAGE_KEY_QUEUE);
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
   * Adds an optimistic Lead locally and queues it for remote Cloud Database sync.
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

    if (this.isOnline()) {
      this.processQueue();
    }
  }

  /**
   * Optimistically logs an activity (with GPS, AI notes) and queues sync.
   */
  public enqueueAddActivity(
    activityData: Omit<Activity, 'id' | '_syncStatus' | 'created_at'>
  ): Activity {
    const tempId = `TEMP-ACT-${Date.now()}`;
    const newActivity: Activity = {
      ...activityData,
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
        ai_summary: activityData.ai_summary || '',
        location_gps: activityData.location_gps || '',
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
      deal_value: globalLead.estimated_value || 50000000,
      next_followup_date: new Date(Date.now() + 86400000 * 2).toISOString().slice(0, 10),
      lead_score: 'Hot',
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
   * Flushes queued mutations to the server / AR Cloud Sync backend.
   */
  public async processQueue(): Promise<{ processed: number; failed: number }> {
    if (this.isSyncing) return { processed: 0, failed: 0 };
    if (!this.isOnline()) return { processed: 0, failed: 0 };

    this.isSyncing = true;
    this.notify();

    let processedCount = 0;
    let failedCount = 0;

    try {
      const queue = CrmStorage.getQueue();
      const remainingQueue: QueuedMutation[] = [];

      for (const item of queue) {
        if (!this.isOnline()) {
          remainingQueue.push(item);
          continue;
        }

        try {
          item.status = 'syncing';
          let endpointPayload: any = { action: item.action, ...item.payload };

          // If updating a lead stage, check if lead_id was originally a TEMP-LEAD that now has a real id
          if (item.action === 'updateLeadStage' && item.payload.id.startsWith('TEMP-')) {
            const currentLeads = CrmStorage.getLeads();
            const matchingLead = currentLeads.find((l) => l.id === item.payload.id);
            if (matchingLead && !matchingLead.id.startsWith('TEMP-')) {
              endpointPayload.id = matchingLead.id;
            }
          }

          const response = await fetch('/api/gas-proxy', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(endpointPayload),
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
          }

          const result = await response.json();

          // Handle response ID updates
          if (result && result.id) {
            if (item.action === 'addLead' || item.action === 'importGlobalLead') {
              const realId = result.id;
              const tempId = item.payload.tempId;
              const leads = CrmStorage.getLeads().map((l) => {
                if (l.id === tempId) {
                  return { ...l, id: realId, _syncStatus: 'synced' as const };
                }
                return l;
              });
              CrmStorage.setLeads(leads);

              // Also update any activity referencing this temp lead id
              const activities = CrmStorage.getActivities().map((a) => {
                if (a.lead_id === tempId) {
                  return { ...a, lead_id: realId };
                }
                return a;
              });
              CrmStorage.setActivities(activities);
            } else if (item.action === 'addActivity') {
              const realActId = result.id;
              const tempId = item.payload.tempId;
              const activities = CrmStorage.getActivities().map((a) => {
                if (a.id === tempId) {
                  return { ...a, id: realActId, _syncStatus: 'synced' as const };
                }
                return a;
              });
              CrmStorage.setActivities(activities);
            }
          }

          // Mark lead updated status
          if (item.action === 'updateLeadStage') {
            const leads = CrmStorage.getLeads().map((l) => {
              if (l.id === item.payload.id) {
                return { ...l, _syncStatus: 'synced' as const };
              }
              return l;
            });
            CrmStorage.setLeads(leads);
          }

          processedCount++;
        } catch (error: any) {
          console.error(`Sync failed for mutation ${item.id}:`, error);
          item.retries += 1;
          item.status = item.retries > 5 ? 'failed' : 'pending';
          item.errorMessage = error.message || String(error);
          remainingQueue.push(item);
          failedCount++;
        }
      }

      CrmStorage.setQueue(remainingQueue);
    } finally {
      this.isSyncing = false;
      this.notify();
    }

    return { processed: processedCount, failed: failedCount };
  }

  /**
   * Pulls fresh data from remote Cloud Database and merges with local offline cache.
   */
  public async pullRemoteData(): Promise<{ leadsCount: number; activitiesCount: number }> {
    if (!this.isOnline()) {
      return {
        leadsCount: CrmStorage.getLeads().length,
        activitiesCount: CrmStorage.getActivities().length,
      };
    }

    try {
      const [leadsRes, actRes] = await Promise.all([
        fetch('/api/gas-proxy?action=getLeads'),
        fetch('/api/gas-proxy?action=getActivities'),
      ]);

      if (leadsRes.ok) {
        const remoteLeads: any[] = await leadsRes.json();
        if (Array.isArray(remoteLeads) && remoteLeads.length > 0) {
          // Merge with local leads, keeping any pending local additions or changes
          const localLeads = CrmStorage.getLeads();
          const pendingLeads = localLeads.filter((l) => l._syncStatus && l._syncStatus !== 'synced');
          
          const merged: Lead[] = [
            ...pendingLeads,
            ...remoteLeads.map((rl) => ({
              id: String(rl.id),
              company_name: String(rl.company_name || ''),
              contact_person: String(rl.contact_person || ''),
              phone: rl.phone || '',
              industry: String(rl.industry || ''),
              city: String(rl.city || ''),
              pipeline_stage: (rl.pipeline_stage || 'Prospect') as PipelineStage,
              deal_value: Number(rl.deal_value) || 0,
              next_followup_date: rl.next_followup_date || '',
              lead_score: (rl.lead_score || 'Warm') as any,
              created_at: rl.created_at,
              updated_at: rl.updated_at,
              _syncStatus: 'synced' as const,
            })).filter((rl) => !pendingLeads.some((pl) => pl.id === rl.id)),
          ];
          CrmStorage.setLeads(merged);
        }
      }

      if (actRes.ok) {
        const remoteActs: any[] = await actRes.json();
        if (Array.isArray(remoteActs) && remoteActs.length > 0) {
          const localActs = CrmStorage.getActivities();
          const pendingActs = localActs.filter((a) => a._syncStatus && a._syncStatus !== 'synced');

          const merged: Activity[] = [
            ...pendingActs,
            ...remoteActs.map((ra) => ({
              id: String(ra.id),
              lead_id: String(ra.lead_id),
              activity_type: String(ra.activity_type || 'Activity'),
              notes: String(ra.notes || ''),
              ai_summary: ra.ai_summary || '',
              location_gps: ra.location_gps || '',
              created_at: ra.created_at,
              _syncStatus: 'synced' as const,
            })).filter((ra) => !pendingActs.some((pa) => pa.id === ra.id)),
          ];
          CrmStorage.setActivities(merged);
        }
      }
    } catch (e) {
      console.warn('Could not pull remote data, using local cache:', e);
    }

    return {
      leadsCount: CrmStorage.getLeads().length,
      activitiesCount: CrmStorage.getActivities().length,
    };
  }
}

export const syncEngine = new CrmSyncEngine();
