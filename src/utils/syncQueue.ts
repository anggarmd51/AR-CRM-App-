import { Lead, Activity, GlobalLead, QueuedMutation, PipelineStage, WonDealArchiveRecord } from '../types/crm.ts';

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
      won_date: new Date().toISOString().slice(0, 10),
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

          // BUG-02 Fix: Dynamically resolve foreign key lead_id for addActivity and archiveClosingWon
          if (
            (item.action === 'addActivity' || item.action === 'archiveClosingWon') &&
            item.payload.lead_id &&
            item.payload.lead_id.startsWith('TEMP-')
          ) {
            const currentLeads = CrmStorage.getLeads();
            const matchingLead = currentLeads.find((l) => l.id === item.payload.lead_id);
            if (matchingLead && !matchingLead.id.startsWith('TEMP-')) {
              endpointPayload.lead_id = matchingLead.id;
              item.payload.lead_id = matchingLead.id;
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

              // Update any activity referencing this temp lead id in local cache
              const activities = CrmStorage.getActivities().map((a) => {
                if (a.lead_id === tempId) {
                  return { ...a, lead_id: realId };
                }
                return a;
              });
              CrmStorage.setActivities(activities);

              // Update local won archives if any referenced this tempId
              const archives = CrmStorage.getWonArchives().map((arc) => {
                if (arc.lead_id === tempId) {
                  return { ...arc, lead_id: realId };
                }
                return arc;
              });
              CrmStorage.setWonArchives(archives);

              // BUG-02 Fix: Propagate realId to all downstream queued mutations
              for (const qItem of queue) {
                if (qItem.payload && qItem.payload.lead_id === tempId) {
                  qItem.payload.lead_id = realId;
                }
                if (qItem.payload && qItem.payload.id === tempId) {
                  qItem.payload.id = realId;
                }
              }
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
   * Pulls fresh data from remote Cloud Database (Google Sheets) and merges with local offline cache.
   */
  public async pullRemoteData(): Promise<{ leadsCount: number; activitiesCount: number; globalLeadsCount: number }> {
    if (!this.isOnline()) {
      return {
        leadsCount: CrmStorage.getLeads().length,
        activitiesCount: CrmStorage.getActivities().length,
        globalLeadsCount: CrmStorage.getGlobalLeads().length,
      };
    }

    try {
      const [leadsRes, actRes, archiveRes, globalRes] = await Promise.all([
        fetch('/api/gas-proxy?action=getLeads').catch(() => null),
        fetch('/api/gas-proxy?action=getActivities').catch(() => null),
        fetch('/api/gas-proxy?action=getArchiveLogs').catch(() => null),
        fetch('/api/gas-proxy?action=getGlobalLeads').catch(() => null),
      ]);

      // 1. Process Leads from Sheet "Leads"
      if (leadsRes && leadsRes.ok) {
        const remoteLeads: any = await leadsRes.json().catch(() => null);
        if (Array.isArray(remoteLeads)) {
          const localLeads = CrmStorage.getLeads();
          const pendingLeads = localLeads.filter((l) => l._syncStatus && l._syncStatus !== 'synced');

          const remoteMapped: Lead[] = remoteLeads
            .filter((rl: any) => rl && rl.id)
            .map((rl: any) => {
              const rawPhone = rl.phone !== undefined && rl.phone !== null ? String(rl.phone).trim() : '';
              let formattedPhone = rawPhone;
              if (rawPhone && !rawPhone.startsWith('+')) {
                if (rawPhone.startsWith('62')) {
                  formattedPhone = `+${rawPhone}`;
                } else if (rawPhone.startsWith('0')) {
                  formattedPhone = `+62${rawPhone.slice(1)}`;
                } else {
                  formattedPhone = `+${rawPhone}`;
                }
              }

              const rawFollowup = rl.next_followup_date ? String(rl.next_followup_date).slice(0, 10) : '';

              return {
                id: String(rl.id),
                company_name: String(rl.company_name || ''),
                contact_person: String(rl.contact_person || ''),
                phone: formattedPhone,
                industry: String(rl.industry || ''),
                city: String(rl.city || ''),
                pipeline_stage: (rl.pipeline_stage || 'Prospect') as PipelineStage,
                deal_value: Number(rl.deal_value) || 0,
                next_followup_date: rawFollowup,
                lead_score: (rl.lead_score || 'Warm') as any,
                created_at: rl.created_at ? String(rl.created_at) : new Date().toISOString(),
                updated_at: rl.updated_at ? String(rl.updated_at) : new Date().toISOString(),
                _syncStatus: 'synced' as const,
              };
            });

          // Merge: keep local pending mutations, combine with remote leads
          const merged: Lead[] = [
            ...pendingLeads,
            ...remoteMapped.filter((rl) => !pendingLeads.some((pl) => pl.id === rl.id)),
          ];
          CrmStorage.setLeads(merged);
        }
      }

      // 2. Process Activities from Sheet "Activities"
      if (actRes && actRes.ok) {
        const remoteActs: any = await actRes.json().catch(() => null);
        if (Array.isArray(remoteActs)) {
          const localActs = CrmStorage.getActivities();
          const pendingActs = localActs.filter((a) => a._syncStatus && a._syncStatus !== 'synced');

          const remoteMapped: Activity[] = remoteActs
            .filter((ra: any) => ra && ra.id)
            .map((ra: any) => ({
              id: String(ra.id),
              lead_id: String(ra.lead_id),
              activity_type: String(ra.activity_type || 'Meeting Check-In'),
              notes: String(ra.notes || ''),
              ai_summary: String(ra.ai_summary || ''),
              location_gps: String(ra.location_gps || ''),
              created_at: ra.created_at ? String(ra.created_at) : new Date().toISOString(),
              _syncStatus: 'synced' as const,
            }));

          const merged: Activity[] = [
            ...pendingActs,
            ...remoteMapped.filter((ra) => !pendingActs.some((pa) => pa.id === ra.id)),
          ];
          CrmStorage.setActivities(merged);
        }
      }

      // 3. Process Archive Logs from Sheet "Archive_Logs"
      if (archiveRes && archiveRes.ok) {
        const remoteArchives: any = await archiveRes.json().catch(() => null);
        if (Array.isArray(remoteArchives)) {
          const localArchives = CrmStorage.getWonArchives();
          const mergedArchives: WonDealArchiveRecord[] = [
            ...localArchives.filter((la) => !remoteArchives.some((ra: any) => ra && ra.id === la.id)),
            ...remoteArchives
              .filter((ra: any) => ra && ra.id)
              .map((ra: any) => ({
                id: String(ra.id),
                lead_id: String(ra.lead_id || ''),
                company_name: String(ra.company_name || ''),
                contact_person: String(ra.contact_person || ''),
                phone: String(ra.phone || ''),
                deal_value: Number(ra.deal_value) || 0,
                industry: String(ra.industry || ''),
                city: String(ra.city || ''),
                won_date: String(ra.won_date || ''),
                archived_at: String(ra.archived_at || ''),
              })),
          ];
          CrmStorage.setWonArchives(mergedArchives);
        }
      }

      // 4. Process Global Leads from Sheet "Global_Leads"
      if (globalRes && globalRes.ok) {
        const remoteGlobal: any = await globalRes.json().catch(() => null);
        if (Array.isArray(remoteGlobal)) {
          const mappedGlobal: GlobalLead[] = remoteGlobal
            .filter((gl: any) => gl && gl.id)
            .map((gl: any) => ({
              id: String(gl.id),
              company_name: String(gl.company_name || ''),
              contact_person: String(gl.contact_person || ''),
              phone: String(gl.phone || ''),
              industry: String(gl.industry || ''),
              city: String(gl.city || ''),
              estimated_value: Number(gl.estimated_value) || 0,
              tags: Array.isArray(gl.tags)
                ? gl.tags
                : typeof gl.tags === 'string' && gl.tags
                ? gl.tags.split(',').map((t: string) => t.trim())
                : [],
            }));
          CrmStorage.setGlobalLeads(mappedGlobal);
        }
      }
    } catch (e) {
      console.warn('Could not pull remote data, using local cache:', e);
    }

    return {
      leadsCount: CrmStorage.getLeads().length,
      activitiesCount: CrmStorage.getActivities().length,
      globalLeadsCount: CrmStorage.getGlobalLeads().length,
    };
  }
}

export const syncEngine = new CrmSyncEngine();
